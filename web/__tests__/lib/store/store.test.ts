import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "@/lib/db";
import {
  addRow,
  addSchedule,
  applySchedules,
  deleteSchedule,
  listSchedules,
  createMonth,
  createSpace,
  deleteRow,
  deleteSpace,
  findMonthId,
  listMonths,
  listSpaces,
  loadMonth,
  previousMonth,
  rowSpace,
  updateRow,
} from "@/lib/store";

const c = (d: number) => d * 100;
let db: Db;
let space: number;

beforeEach(() => {
  db = openDb(":memory:");
  space = createSpace(db, "Household");
});

describe("spaces and months", () => {
  it("creates and lists spaces in order", () => {
    createSpace(db, "Me");
    expect(listSpaces(db).map((s) => s.name)).toEqual(["Household", "Me"]);
  });

  it("creates an empty first month and is idempotent", () => {
    const id = createMonth(db, space, "2026-12");
    expect(createMonth(db, space, "2026-12")).toBe(id);
    expect(loadMonth(db, id).bills).toEqual([]);
    expect(listMonths(db, space)).toEqual(["2026-12"]);
  });

  it("deleting a space removes its months and rows", () => {
    const m = createMonth(db, space, "2026-12");
    addRow(db, "bill", m, { name: "Power" });
    deleteSpace(db, space);
    expect(findMonthId(db, space, "2026-12")).toBeUndefined();
    expect(db.prepare("SELECT COUNT(*) AS n FROM bills").get()).toEqual({ n: 0 });
  });
});

describe("rows", () => {
  it("adds, updates and deletes each kind", () => {
    const m = createMonth(db, space, "2026-12");
    const bill = addRow(db, "bill", m, { name: "Power", status: "Pending", projected: c(600), dueDay: 23 });
    updateRow(db, "bill", bill, { status: "Paid", notes: "autopay", startBalance: c(400) });
    expect(loadMonth(db, m).bills[0]).toMatchObject({
      name: "Power",
      status: "Paid",
      projected: c(600),
      startBalance: c(400),
      notes: "autopay",
      dueDay: 23,
      scheduledDay: null,
    });

    const bank = addRow(db, "bank", m, { name: "Checking", balance: c(13000) });
    const inc = addRow(db, "income", m, { label: "Pay", date: "2026-12-04", amount: c(500) });
    const extra = addRow(db, "adhoc", m, { name: "Zakat", projected: c(1000), tag: "Charity" });
    const loaded = loadMonth(db, m);
    expect(loaded.banks[0].balance).toBe(c(13000));
    expect(loaded.incomes[0]).toMatchObject({ status: "Pending", amount: c(500) });
    expect(loaded.adHoc[0]).toMatchObject({ status: "Pending", tag: "Charity" });

    deleteRow(db, "bill", bill);
    deleteRow(db, "bank", bank);
    deleteRow(db, "income", inc);
    deleteRow(db, "adhoc", extra);
    const after = loadMonth(db, m);
    expect([after.bills, after.banks, after.incomes, after.adHoc].every((r) => r.length === 0)).toBe(true);
  });

  it("ignores unknown fields and rejects bad statuses", () => {
    const m = createMonth(db, space, "2026-12");
    const bill = addRow(db, "bill", m, { name: "X" });
    updateRow(db, "bill", bill, { "name = 'hacked' --": "x", id: 99 });
    expect(loadMonth(db, m).bills[0]).toMatchObject({ id: bill, name: "X" });
    expect(() => updateRow(db, "bill", bill, { status: "Bogus" })).toThrow();
  });

  it("knows which space owns a row", () => {
    const other = createSpace(db, "Mom");
    const m = createMonth(db, space, "2026-12");
    const bill = addRow(db, "bill", m, { name: "X" });
    expect(rowSpace(db, "bill", bill)).toBe(space);
    expect(rowSpace(db, "bill", bill)).not.toBe(other);
    expect(rowSpace(db, "bill", 9999)).toBeUndefined();
  });
});

describe("new month copy", () => {
  it("carries bills, banks and weekly income forward, but not ad-hoc payments", () => {
    const dec = createMonth(db, space, "2026-12");
    addRow(db, "bank", dec, { name: "Checking", balance: c(13000) });
    addRow(db, "bill", dec, { name: "Card", status: "Paid", projected: c(400), startBalance: c(700), dueDay: 12, notes: "keep" });
    addRow(db, "bill", dec, { name: "Water", status: "None", projected: 0, startBalance: 0, dueDay: 27 });
    addRow(db, "bill", dec, { name: "Power", status: "Payment Made", projected: c(600), startBalance: c(400) });
    for (const [i, date] of ["2026-12-04", "2026-12-11", "2026-12-18"].entries()) {
      addRow(db, "income", dec, { label: `Week ${i + 1}`, date, amount: c(500), status: "Received" });
    }
    addRow(db, "adhoc", dec, { name: "Trip", projected: c(900) });

    const jan = createMonth(db, space, "2027-01");
    const rows = loadMonth(db, jan);

    expect(rows.banks.map((b) => [b.name, b.balance])).toEqual([["Checking", c(13000)]]);
    expect(rows.adHoc).toEqual([]);

    const byName = Object.fromEntries(rows.bills.map((b) => [b.name, b]));
    // Paid card: balance carries on (700 - 400), status resets to Pending.
    expect(byName.Card).toMatchObject({ status: "Pending", projected: c(400), startBalance: c(300), dueDay: 12, notes: "keep" });
    // No amount: stays None.
    expect(byName.Water).toMatchObject({ status: "None", projected: 0 });
    // Not yet paid: balance is unchanged.
    expect(byName.Power).toMatchObject({ status: "Pending", startBalance: c(400), scheduledDay: null });

    // Weekly income continues after the last date (Dec 18) and lands in January.
    expect(rows.incomes.map((i) => [i.date, i.status, i.amount])).toEqual([
      ["2027-01-01", "Pending", c(500)],
      ["2027-01-08", "Pending", c(500)],
      ["2027-01-15", "Pending", c(500)],
    ]);
  });

  it("copies from the newest earlier month, even with a gap", () => {
    const a = createMonth(db, space, "2026-10");
    addRow(db, "bill", a, { name: "Rent", projected: c(900) });
    expect(previousMonth(db, space, "2026-12")).toBe("2026-10");
    const dec = createMonth(db, space, "2026-12");
    expect(loadMonth(db, dec).bills.map((b) => b.name)).toEqual(["Rent"]);
  });

  it("does not touch other spaces", () => {
    const other = createSpace(db, "Mom");
    const a = createMonth(db, other, "2026-11");
    addRow(db, "bill", a, { name: "Hers", projected: c(10) });
    const dec = createMonth(db, space, "2026-12");
    expect(loadMonth(db, dec).bills).toEqual([]);
  });
});

describe("income schedules", () => {
  it("applies paydays once and skips ones already generated", () => {
    addSchedule(db, space, { label: "Paycheck", amount: c(2000), frequency: "biweekly", anchor: "2026-11-06" });
    const id = createMonth(db, space, "2026-11");
    const dates = () => loadMonth(db, id).incomes.map((i) => i.date);
    expect(dates()).toEqual(["2026-11-06", "2026-11-20"]);
    expect(loadMonth(db, id).incomes[0]).toMatchObject({ label: "Paycheck", amount: c(2000), status: "Pending" });
    expect(applySchedules(db, space, id, "2026-11")).toBe(0);
    expect(dates()).toEqual(["2026-11-06", "2026-11-20"]);
  });

  it("a new month is filled from the schedules instead of copying income forward", () => {
    addSchedule(db, space, { label: "Pay", amount: c(1000), frequency: "weekly", anchor: "2026-11-06" });
    createMonth(db, space, "2026-11");
    const dec = createMonth(db, space, "2026-12");
    expect(loadMonth(db, dec).incomes.map((i) => i.date)).toEqual(["2026-12-04", "2026-12-11", "2026-12-18", "2026-12-25"]);
  });

  it("adding a schedule later and applying fills only the missing paydays", () => {
    const id = createMonth(db, space, "2026-11");
    addRow(db, "income", id, { label: "Bonus", date: "2026-11-15", amount: c(500) });
    addSchedule(db, space, { label: "Pay", amount: c(100), frequency: "monthly", anchor: "2026-11-28" });
    expect(applySchedules(db, space, id, "2026-11")).toBe(1);
    expect(loadMonth(db, id).incomes.map((i) => i.label)).toEqual(["Bonus", "Pay"]);
  });

  it("deleting a schedule keeps the income already received and drops the Pending rest", () => {
    const sid = addSchedule(db, space, { label: "Pay", amount: c(100), frequency: "monthly", anchor: "2026-11-05" });
    const id = createMonth(db, space, "2026-11");
    db.prepare("UPDATE incomes SET status = 'Received' WHERE month_id = ?").run(id);
    deleteSchedule(db, sid);
    expect(listSchedules(db, space)).toEqual([]);
    expect(loadMonth(db, id).incomes).toHaveLength(1);
    expect(loadMonth(db, id).incomes[0].scheduleId).toBeNull();
  });
});
