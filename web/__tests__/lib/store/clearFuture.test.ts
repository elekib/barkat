import { describe, expect, it } from "vitest";
import { openDb } from "@/lib/db";
import { addRow, addSchedule, clearFutureMonths, clearMonth, createMonth, createSpace, findMonthId, futureMonths, listMonths, loadMonth } from "@/lib/store";

const c = (d: number) => d * 100;

function book() {
  const db = openDb(":memory:");
  const space = createSpace(db, "Household");
  const first = createMonth(db, space, "2026-01");
  addRow(db, "bank", first, { name: "Checking", kind: "Checking", balance: c(1000) });
  addRow(db, "bill", first, { name: "Rent", status: "Pending", projected: c(300), dueDay: 3 });
  addSchedule(db, space, { label: "Pay", amount: c(500), frequency: "monthly", anchor: "2026-01-09", account: "Checking" });
  for (const ym of ["2026-02", "2026-03", "2026-04", "2026-05"]) createMonth(db, space, ym);
  return { db, space };
}

describe("clearFutureMonths", () => {
  it("lists the months after the cut with their sizes, newest first", () => {
    const { db, space } = book();
    const f = futureMonths(db, space, "2026-02");
    expect(f.map((m) => m.ym)).toEqual(["2026-05", "2026-04", "2026-03"]);
    expect(f.every((m) => m.items > 0)).toBe(true);
  });

  it("deletes only the months after the cut and leaves earlier balances and schedules alone", () => {
    const { db, space } = book();
    const before = loadMonth(db, findMonthId(db, space, "2026-02")!)!.banks.map((b) => [b.name, b.balance, b.opening]);
    const removed = clearFutureMonths(db, space, "2026-02");
    expect(removed.sort()).toEqual(["2026-03", "2026-04", "2026-05"]);
    expect(listMonths(db, space).sort()).toEqual(["2026-01", "2026-02"]);
    expect(loadMonth(db, findMonthId(db, space, "2026-02")!)!.banks.map((b) => [b.name, b.balance, b.opening])).toEqual(before);
    expect((db.prepare("SELECT COUNT(*) AS n FROM income_schedules WHERE space_id = ?").get(space) as { n: number }).n).toBe(1);
  });

  it("removes the cleared months' rows and nothing else", () => {
    const { db, space } = book();
    const other = createSpace(db, "Parents");
    createMonth(db, other, "2026-09");
    clearFutureMonths(db, space, "2026-02");
    const orphans = db.prepare("SELECT COUNT(*) AS n FROM bills WHERE month_id NOT IN (SELECT id FROM months)").get() as { n: number };
    expect(orphans.n).toBe(0);
    expect(listMonths(db, other)).toEqual(["2026-09"]);
  });

  it("does nothing when there are no later months, and a cleared month can be started again", () => {
    const { db, space } = book();
    expect(clearFutureMonths(db, space, "2026-05")).toEqual([]);
    clearFutureMonths(db, space, "2026-02");
    createMonth(db, space, "2026-03");
    expect(listMonths(db, space).sort()).toEqual(["2026-01", "2026-02", "2026-03"]);
  });
});

describe("clearMonth", () => {
  it("deletes one month after the cut and leaves the others", () => {
    const { db, space } = book();
    expect(clearMonth(db, space, "2026-04", "2026-02")).toBe(true);
    expect(listMonths(db, space).sort()).toEqual(["2026-01", "2026-02", "2026-03", "2026-05"]);
  });

  it("refuses the cut month, earlier months and months that do not exist", () => {
    const { db, space } = book();
    expect(clearMonth(db, space, "2026-02", "2026-02")).toBe(false);
    expect(clearMonth(db, space, "2026-01", "2026-02")).toBe(false);
    expect(clearMonth(db, space, "2026-09", "2026-02")).toBe(false);
    expect(listMonths(db, space)).toHaveLength(5);
  });
});
