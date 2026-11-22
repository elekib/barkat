import { describe, expect, it } from "vitest";
import { openDb } from "@/lib/db";
import { exportBook, parseBackup, restoreBook } from "@/lib/backup";
import { addRow, addSchedule, applySchedules, createMonth, createSpace, findMonthId, listMonths, loadMonth, overrideBalance } from "@/lib/store";

const c = (d: number) => d * 100;

function book() {
  const db = openDb(":memory:");
  const space = createSpace(db, "Household");
  const jan = createMonth(db, space, "2026-01");
  const checking = addRow(db, "bank", jan, { name: "Checking", kind: "Checking", balance: c(1000) });
  addRow(db, "bank", jan, { name: "Savings", kind: "Savings", balance: c(50) });
  addSchedule(db, space, { label: "Pay", amount: c(500), frequency: "biweekly", anchor: "2026-01-02", account: "Checking" });
  applySchedules(db, space, jan, "2026-01");
  addRow(db, "bill", jan, { name: "Rent", status: "Paid", projected: c(300), startBalance: c(900), dueDay: 3, notes: "n", bankId: checking });
  addRow(db, "adhoc", jan, { name: "Trip", status: "Payment Made", projected: c(80), tag: "Travel", bankId: checking });
  overrideBalance(db, jan, checking, c(1234));
  createMonth(db, space, "2026-02");
  return { db, space };
}

describe("book backup", () => {
  it("restores as a new book that looks identical, in another database", () => {
    const { db, space } = book();
    const text = JSON.stringify(exportBook(db, space));

    const other = openDb(":memory:");
    const id = restoreBook(other, parseBackup(text));
    expect(listMonths(other, id)).toEqual(listMonths(db, space));
    for (const ym of listMonths(db, space)) {
      const a = loadMonth(db, findMonthId(db, space, ym)!);
      const b = loadMonth(other, findMonthId(other, id, ym)!);
      const plain = (m: ReturnType<typeof loadMonth>) => JSON.parse(JSON.stringify({ ...m, monthId: 0, banks: m.banks.map((x) => ({ ...x, id: 0 })), bills: m.bills.map((x) => ({ ...x, id: 0, bankId: m.banks.findIndex((k) => k.id === x.bankId) })), adHoc: m.adHoc.map((x) => ({ ...x, id: 0, bankId: m.banks.findIndex((k) => k.id === x.bankId) })), incomes: m.incomes.map((x) => ({ ...x, id: 0, scheduleId: x.scheduleId === null ? null : 1, bankId: m.banks.findIndex((k) => k.id === x.bankId) })) }));
      expect(plain(b)).toEqual(plain(a));
    }
    expect(loadMonth(other, findMonthId(other, id, "2026-01")!).banks[0].balance).toBe(c(1234));
  });

  it("restores into the same database under a new name", () => {
    const { db, space } = book();
    const again = restoreBook(db, parseBackup(JSON.stringify(exportBook(db, space))));
    const names = (db.prepare("SELECT name FROM spaces ORDER BY id").all() as { name: string }[]).map((r) => r.name);
    expect(again).not.toBe(space);
    expect(names).toEqual(["Household", "Household (2)"]);
  });

  it("rejects files that are not a backup", () => {
    expect(() => parseBackup("nope")).toThrow(/not valid JSON/);
    expect(() => parseBackup(JSON.stringify({ app: "other" }))).toThrow(/not a valid Barkat backup/);
    const { db, space } = book();
    const bad = exportBook(db, space)!;
    bad.months[0].bills[0].account = 9;
    expect(() => parseBackup(JSON.stringify(bad))).toThrow(/points at an account/);
  });
});
