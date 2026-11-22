import { describe, expect, it } from "vitest";
import { openDb } from "@/lib/db";
import { exportBook } from "@/lib/backup";
import { fileKind, yearFromName } from "@/lib/excel/months";
import { backupMonths, planImport, readImportFile, type ReadFile } from "@/lib/import";
import { addRow, createMonth, createSpace } from "@/lib/store";
import type { ImportedMonth } from "@/lib/excel/read";

const month = (ym: string): ImportedMonth => ({ ym, sheet: ym, banks: [{ name: "Checking", kind: "", balance: 100 }], bills: [], adHoc: [], incomes: [] });
const file = (name: string, yms: string[], skipped: ReadFile["skipped"] = []): ReadFile => ({ file: name, kind: "xlsx", months: yms.map(month), skipped });

describe("file names", () => {
  it("finds a year in a file name", () => {
    expect(yearFromName("2022.xlsx")).toBe(2022);
    expect(yearFromName("Budget_2019_final.xlsx")).toBe(2019);
    expect(yearFromName("household-1998.xlsx")).toBe(1998);
    expect(yearFromName("budget.xlsx")).toBeNull();
    expect(yearFromName("12345.xlsx")).toBeNull();
  });
  it("tells workbooks from backups", () => {
    expect([fileKind("a.XLSX"), fileKind("b.json"), fileKind("c.csv")]).toEqual(["xlsx", "backup", null]);
  });
});

describe("planImport", () => {
  it("lists every month oldest first, adding new ones and skipping the ones already there", () => {
    const plan = planImport([file("2023.xlsx", ["2023-02", "2023-01"]), file("2022.xlsx", ["2022-12"], [{ sheet: "Notes", reason: "The name is not a month" }])], ["2023-01"], false);
    expect(plan.rows.map((r) => [r.ym, r.action])).toEqual([["2022-12", "add"], ["2023-01", "skip"], ["2023-02", "add"]]);
    expect(plan.rows[1].note).toBe("Already in this book");
    expect(plan.write.map((m) => m.ym)).toEqual(["2022-12", "2023-02"]);
    expect(plan.skipped).toEqual([{ file: "2022.xlsx", sheet: "Notes", reason: "The name is not a month" }]);
    expect(plan.rows[0]).toMatchObject({ bills: 0, oneOffs: 0, income: 0, accounts: 1 });
  });

  it("replaces existing months when asked", () => {
    const plan = planImport([file("a.xlsx", ["2023-01"])], ["2023-01"], true);
    expect(plan.rows[0].action).toBe("replace");
    expect(plan.write).toHaveLength(1);
  });

  it("takes a month in two files from the first", () => {
    const plan = planImport([file("a.xlsx", ["2023-01"]), file("b.xlsx", ["2023-01", "2023-02"])], [], false);
    expect(plan.rows.map((r) => [r.file, r.ym, r.action])).toEqual([["a.xlsx", "2023-01", "add"], ["b.xlsx", "2023-01", "skip"], ["b.xlsx", "2023-02", "add"]]);
    expect(plan.rows[1].note).toBe("Also in a.xlsx");
  });
});

describe("backup files", () => {
  it("turn into months stored as they were, with accounts linked by position", async () => {
    const db = openDb(":memory:");
    const space = createSpace(db, "Old");
    const m = createMonth(db, space, "2022-03");
    const a = addRow(db, "bank", m, { name: "Santander", balance: 500 });
    addRow(db, "bank", m, { name: "Santander", balance: 700 });
    addRow(db, "bill", m, { name: "Rent", projected: 300, bankId: a });
    const text = JSON.stringify(exportBook(db, space));
    const read = await readImportFile("old.json", new TextEncoder().encode(text), null);
    expect(read.kind).toBe("backup");
    expect(read.months[0]).toMatchObject({ ym: "2022-03", exact: true });
    expect(read.months[0].bills[0]).toMatchObject({ name: "Rent", accountAt: 0, account: "Santander" });
    expect(backupMonths(JSON.parse(text))[0].banks.map((b) => b.balance)).toEqual([500, 700]);
  });

  it("refuse text that is not a backup, and files of other types", async () => {
    await expect(readImportFile("x.json", new TextEncoder().encode("{}"), null)).rejects.toThrow(/not a valid Barkat backup/);
    await expect(readImportFile("x.csv", new Uint8Array(), null)).rejects.toThrow(/only .xlsx/);
  });
});
