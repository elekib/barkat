import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "@/lib/db";
import { readWorkbook } from "@/lib/excel/read";
import { buildWorkbook } from "@/lib/excel/write";
import {
  addRow,
  addSchedule,
  applySchedules,
  bankInMonth,
  bulkRows,
  bulkSchedules,
  copyIntoMonth,
  createBlankMonth,
  createMonth,
  createSpace,
  deleteSpace,
  findMonthId,
  importMonth,
  listMonthRows,
  listSpaces,
  loadMonth,
  moveSpace,
  rowMonth,
  spaceContents,
} from "@/lib/store";

let db: Db;
let space: number;
beforeEach(() => {
  db = openDb(":memory:");
  space = createSpace(db, "Household");
});

function setup() {
  const m = createMonth(db, space, "2026-12");
  const mom = addRow(db, "bank", m, { name: "Mom's", balance: 100000 });
  const dad = addRow(db, "bank", m, { name: "Dad's", balance: 50000 });
  return { m, mom, dad };
}

describe("accounts on rows", () => {
  it("stores the account on bills, one-offs and income", () => {
    const { m, mom, dad } = setup();
    addRow(db, "bill", m, { name: "Water", bankId: mom });
    addRow(db, "adhoc", m, { name: "Trip", bankId: dad });
    addRow(db, "income", m, { label: "Pay", date: "2026-12-04", amount: 1, bankId: dad });
    const rows = loadMonth(db, m);
    expect([rows.bills[0].bankId, rows.adHoc[0].bankId, rows.incomes[0].bankId]).toEqual([mom, dad, dad]);
  });

  it("knows which month a row and an account belong to", () => {
    const { m, mom } = setup();
    const other = createMonth(db, space, "2027-01");
    const bill = addRow(db, "bill", m, { name: "Water" });
    expect(rowMonth(db, "bill", bill)).toBe(m);
    expect(bankInMonth(db, mom, m)).toBe(true);
    expect(bankInMonth(db, mom, other)).toBe(false);
  });

  it("clears the link when an account is deleted", () => {
    const { m, mom } = setup();
    addRow(db, "bill", m, { name: "Water", bankId: mom });
    db.prepare("DELETE FROM banks WHERE id = ?").run(mom);
    expect(loadMonth(db, m).bills[0].bankId).toBeNull();
  });

  it("carries accounts into a copied month, pointing at the new month's accounts", () => {
    const { m, mom, dad } = setup();
    addRow(db, "bill", m, { name: "Water", bankId: mom });
    addRow(db, "bill", m, { name: "Gas", bankId: dad });
    const next = createMonth(db, space, "2027-01");
    const rows = loadMonth(db, next);
    const byName = Object.fromEntries(rows.banks.map((b) => [b.name, b.id]));
    expect(rows.bills.map((b) => b.bankId)).toEqual([byName["Mom's"], byName["Dad's"]]);
    expect(rows.bills[0].bankId).not.toBe(mom);
  });

  it("puts scheduled income into the account named by the schedule", () => {
    const { m, dad } = setup();
    addSchedule(db, space, { label: "Pay", amount: 100, frequency: "weekly", anchor: "2026-12-04", account: "dad's" });
    applySchedules(db, space, m, "2026-12");
    expect(loadMonth(db, m).incomes.every((i) => i.bankId === dad)).toBe(true);
  });
});

describe("accounts in Excel", () => {
  it("survive export and import by name", async () => {
    const { m, mom, dad } = setup();
    addRow(db, "bill", m, { name: "Water", projected: 4000, bankId: mom });
    addRow(db, "adhoc", m, { name: "Trip", projected: 9000, bankId: dad });
    addRow(db, "income", m, { label: "Pay", date: "2026-12-04", amount: 500, bankId: dad });
    const file = await buildWorkbook(listMonthRows(db, space));
    const read = await readWorkbook(new Uint8Array(file), 2026);
    expect(read.months[0].bills[0].account).toBe("Mom's");
    expect(read.months[0].adHoc[0].account).toBe("Dad's");
    expect(read.months[0].incomes[0].account).toBe("Dad's");

    const other = createSpace(db, "Copy");
    importMonth(db, other, read.months[0], false);
    const rows = loadMonth(db, findMonthId(db, other, "2026-12")!);
    const name = (id: number | null) => rows.banks.find((b) => b.id === id)?.name;
    expect([name(rows.bills[0].bankId), name(rows.adHoc[0].bankId), name(rows.incomes[0].bankId)]).toEqual(["Mom's", "Dad's", "Dad's"]);
  });

  it("gives rows without an account to the first one only when asked", async () => {
    const { m } = setup();
    addRow(db, "bill", m, { name: "Water" });
    const read = await readWorkbook(new Uint8Array(await buildWorkbook(listMonthRows(db, space))), 2026);
    const a = createSpace(db, "A");
    const b = createSpace(db, "B");
    importMonth(db, a, read.months[0], false);
    importMonth(db, b, read.months[0], false, { defaultToFirstAccount: true });
    const get = (s: number) => loadMonth(db, findMonthId(db, s, "2026-12")!);
    expect(get(a).bills[0].bankId).toBeNull();
    expect(get(b).bills[0].bankId).toBe(get(b).banks[0].id);
  });
});

describe("copying from a chosen month", () => {
  it("starts a new month from any month, not just the previous one", () => {
    const { m, mom } = setup();
    addRow(db, "bill", m, { name: "Water", projected: 4000, bankId: mom });
    const later = createMonth(db, space, "2027-03");
    addRow(db, "bill", later, { name: "Only in March", projected: 100 });
    const fresh = createMonth(db, space, "2027-02", "2026-12");
    expect(loadMonth(db, fresh).bills.map((b) => b.name)).toEqual(["Water"]);
    const fromLater = createMonth(db, space, "2027-01", "2027-03");
    expect(loadMonth(db, fromLater).bills.map((b) => b.name)).toEqual(["Water", "Only in March"]);
  });

  it("falls back to the previous month when the chosen one does not exist", () => {
    const { m } = setup();
    addRow(db, "bill", m, { name: "Water", projected: 1 });
    expect(loadMonth(db, createMonth(db, space, "2027-01", "1999-01")).bills).toHaveLength(1);
  });

  it("merges into an existing month without duplicating, and keeps accounts", () => {
    const { m, dad } = setup();
    addRow(db, "bill", m, { name: "Gas", projected: 5000, bankId: dad });
    addRow(db, "bill", m, { name: "Water", projected: 4000 });
    const target = createMonth(db, space, "2027-02", "2026-12");
    db.prepare("DELETE FROM bills WHERE month_id = ? AND name = 'Gas'").run(target);
    db.prepare("DELETE FROM bills WHERE month_id = ? AND name = 'Water'").run(target);
    addRow(db, "bill", target, { name: "water", projected: 1 });
    const res = copyIntoMonth(db, space, target, "2026-12");
    expect(res).toEqual({ banks: 0, bills: 1 });
    const rows = loadMonth(db, target);
    expect(rows.bills.map((b) => b.name).sort()).toEqual(["Gas", "water"]);
    const gas = rows.bills.find((b) => b.name === "Gas")!;
    expect(rows.banks.find((b) => b.id === gas.bankId)?.name).toBe("Dad's");
    expect(copyIntoMonth(db, space, target, "2026-12")).toEqual({ banks: 0, bills: 0 });
  });

  it("replaces bills and accounts completely, keeping one-offs and income linked by account name", () => {
    const { m, mom } = setup();
    addRow(db, "bill", m, { name: "Water", projected: 4000, bankId: mom });
    const target = createMonth(db, space, "2027-02", "2026-12");
    const t = loadMonth(db, target);
    addRow(db, "bill", target, { name: "Stale", projected: 1 });
    const dadT = t.banks.find((b) => b.name === "Dad's")!.id;
    addRow(db, "adhoc", target, { name: "Trip", projected: 9, bankId: dadT });
    addRow(db, "income", target, { label: "Pay", date: "2027-02-04", amount: 5, bankId: dadT });
    expect(copyIntoMonth(db, space, target, "2026-12", "replace")).toEqual({ banks: 2, bills: 1 });
    const rows = loadMonth(db, target);
    expect(rows.bills.map((b) => b.name)).toEqual(["Water"]);
    expect(rows.banks.map((b) => b.name)).toEqual(["Mom's", "Dad's"]);
    const nameOf = (id: number | null) => rows.banks.find((b) => b.id === id)?.name;
    expect(nameOf(rows.adHoc[0].bankId)).toBe("Dad's");
    expect(nameOf(rows.incomes.find((i) => i.label === "Pay")!.bankId)).toBe("Dad's");
    expect(nameOf(rows.bills[0].bankId)).toBe("Mom's");
  });

  it("copies only the chosen lines, plus the account a chosen bill is paid from", () => {
    const { m, mom, dad } = setup();
    addRow(db, "bill", m, { name: "Water", projected: 1, bankId: mom });
    addRow(db, "bill", m, { name: "Gas", projected: 2, bankId: dad });
    addRow(db, "bill", m, { name: "Rent", projected: 3 });
    const target = createMonth(db, space, "2027-02", "2026-12");
    db.prepare("DELETE FROM bills WHERE month_id = ?").run(target);
    db.prepare("DELETE FROM banks WHERE month_id = ?").run(target);
    const src = loadMonth(db, m);
    const gas = src.bills.find((b) => b.name === "Gas")!;
    const res = copyIntoMonth(db, space, target, "2026-12", "merge", { bankIds: [], billIds: [gas.id] });
    expect(res).toEqual({ banks: 1, bills: 1 });
    const rows = loadMonth(db, target);
    expect(rows.bills.map((b) => b.name)).toEqual(["Gas"]);
    expect(rows.banks.map((b) => b.name)).toEqual(["Dad's"]);
    expect(rows.bills[0].bankId).toBe(rows.banks[0].id);
  });

  it("fills a blank month with just the chosen lines", () => {
    const { m, dad } = setup();
    addRow(db, "bill", m, { name: "Water", projected: 1 });
    addRow(db, "bill", m, { name: "Gas", projected: 2, bankId: dad });
    const blank = createBlankMonth(db, space, "2027-02");
    expect(loadMonth(db, blank)).toMatchObject({ banks: [], bills: [], incomes: [], adHoc: [] });
    expect(createBlankMonth(db, space, "2027-02")).toBe(blank);
    const gas = loadMonth(db, m).bills.find((b) => b.name === "Gas")!;
    copyIntoMonth(db, space, blank, "2026-12", "merge", { bankIds: [], billIds: [gas.id] });
    expect(loadMonth(db, blank).bills.map((b) => b.name)).toEqual(["Gas"]);
  });
});

describe("deleting a space", () => {
  it("counts what is inside and removes all of it, leaving other spaces alone", () => {
    const { m, mom } = setup();
    addRow(db, "bill", m, { name: "Water", bankId: mom });
    addRow(db, "adhoc", m, { name: "Trip" });
    addRow(db, "income", m, { label: "Pay", date: "2026-12-04", amount: 1 });
    addSchedule(db, space, { anchor: "2026-12-01" });
    const keep = createSpace(db, "Keep");
    const keepMonth = createMonth(db, keep, "2026-12");
    addRow(db, "bill", keepMonth, { name: "Rent" });

    expect(spaceContents(db, space)).toEqual({ months: 1, accounts: 2, bills: 1, oneOffs: 1, income: 1, schedules: 1 });
    deleteSpace(db, space);
    expect(findMonthId(db, space, "2026-12")).toBeUndefined();
    expect(spaceContents(db, space)).toEqual({ months: 0, accounts: 0, bills: 0, oneOffs: 0, income: 0, schedules: 0 });
    expect(loadMonth(db, keepMonth).bills).toHaveLength(1);
  });
});

describe("book order", () => {
  it("moves a space earlier or later, and stops at the ends", () => {
    const b = createSpace(db, "Personal");
    const c = createSpace(db, "Investing");
    const names = () => listSpaces(db).map((x) => x.name);
    expect(names()).toEqual(["Household", "Personal", "Investing"]);
    moveSpace(db, c, -1);
    expect(names()).toEqual(["Household", "Investing", "Personal"]);
    moveSpace(db, c, -1);
    moveSpace(db, c, -1);
    expect(names()).toEqual(["Investing", "Household", "Personal"]);
    moveSpace(db, b, 1);
    expect(names()).toEqual(["Investing", "Household", "Personal"]);
  });
});

describe("bulk changes", () => {
  it("sets a status on many rows and ignores ids from another space", () => {
    const { m } = setup();
    const a = addRow(db, "bill", m, { name: "A" });
    const b = addRow(db, "bill", m, { name: "B" });
    const other = createSpace(db, "Other");
    const om = createMonth(db, other, "2026-12");
    const foreign = addRow(db, "bill", om, { name: "Foreign" });
    const n = bulkRows(db, space, "bill", [a, b, foreign, a], { type: "set", values: { status: "Paid" } });
    expect(n).toBe(2);
    expect(loadMonth(db, m).bills.map((x) => x.status)).toEqual(["Paid", "Paid"]);
    expect(loadMonth(db, om).bills[0].status).not.toBe("Paid");
  });

  it("sets an account only when it belongs to the rows' month", () => {
    const { m, mom } = setup();
    const other = createMonth(db, space, "2027-01");
    const foreignBank = addRow(db, "bank", other, { name: "Elsewhere" });
    const a = addRow(db, "adhoc", m, { name: "Trip" });
    expect(bulkRows(db, space, "adhoc", [a], { type: "set", values: { bankId: foreignBank } })).toBe(0);
    expect(bulkRows(db, space, "adhoc", [a], { type: "set", values: { bankId: mom } })).toBe(1);
    expect(loadMonth(db, m).adHoc[0].bankId).toBe(mom);
  });

  it("deletes many rows, and many schedules", () => {
    const { m } = setup();
    const a = addRow(db, "income", m, { label: "Pay", date: "2026-12-04", amount: 1 });
    const b = addRow(db, "income", m, { label: "Pay2", date: "2026-12-05", amount: 1 });
    expect(bulkRows(db, space, "income", [a, b], { type: "delete" })).toBe(2);
    expect(loadMonth(db, m).incomes).toHaveLength(0);

    const s1 = addSchedule(db, space, { anchor: "2026-12-01" });
    const s2 = addSchedule(db, space, { anchor: "2026-12-02" });
    expect(bulkSchedules(db, space, [s1, s2], { type: "set", values: { account: "Dad's" } })).toBe(2);
    expect(bulkSchedules(db, space, [s1, s2], { type: "delete" })).toBe(2);
    expect(bulkSchedules(db, space, [s1], { type: "delete" })).toBe(0);
  });
});
