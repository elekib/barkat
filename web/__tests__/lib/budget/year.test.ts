import { describe, expect, it } from "vitest";
import { isAdjustment, isYear, yearInputs, yearView, yearsWithData, type YearInput } from "@/lib/budget/year";

const c = (d: number) => d * 100;
const m = (ym: string, income: number, spending: number, cushion: number, empty = false): YearInput => ({ ym, income: c(income), spending: c(spending), cushion: c(cushion), empty });

describe("yearView", () => {
  const inputs = [m("2025-12", 9, 9, 9), m("2026-01", 3000, 2000, 500), m("2026-02", 3000, 3500, -100), m("2026-04", 3300, 2800, 900), m("2026-05", 0, 0, 0, true)];

  it("lists twelve months, with the ones that have no data marked", () => {
    const v = yearView(inputs, 2026);
    expect(v.months).toHaveLength(12);
    expect(v.months.map((x) => x.status)).toEqual(["data", "data", "missing", "data", "empty", "missing", "missing", "missing", "missing", "missing", "missing", "missing"]);
    expect(v.months[2]).toMatchObject({ ym: "2026-03", income: 0, cushion: null });
  });

  it("totals the months with data, and takes the cushion from the last of them", () => {
    const v = yearView(inputs, 2026);
    expect(v.counted).toBe(3);
    expect(v.totals).toEqual({ income: c(9300), spending: c(8300), saved: c(1000), cushion: c(900) });
    expect(v.months[1]).toMatchObject({ saved: c(-500) });
    expect(v.savingsRate).toBeCloseTo(1000 / 9300);
    expect([v.first, v.last]).toEqual(["2026-01", "2026-04"]);
  });

  it("averages over the months with data only, in whole cents", () => {
    const v = yearView(inputs, 2026);
    expect(v.average).toEqual({ income: c(3100), spending: Math.round(c(8300) / 3), saved: Math.round(c(1000) / 3), cushion: Math.round(c(500 - 100 + 900) / 3) });
    expect(Number.isInteger(v.average!.spending)).toBe(true);
  });

  it("handles a year with no data", () => {
    const v = yearView(inputs, 2019);
    expect(v.counted).toBe(0);
    expect(v.average).toBeNull();
    expect(v.totals).toEqual({ income: 0, spending: 0, saved: 0, cushion: null });
    expect(v.savingsRate).toBeNull();
    expect(v.months.every((x) => x.status === "missing")).toBe(true);
    expect(yearView([], 2026).counted).toBe(0);
  });

  it("has no savings rate without income", () => {
    expect(yearView([m("2026-01", 0, 50, -50)], 2026).savingsRate).toBeNull();
  });

  it("lists the years that have data, newest first, leaving out empty months", () => {
    expect(yearsWithData([m("2022-03", 1, 1, 1), m("2026-01", 1, 1, 1), m("2024-01", 0, 0, 0, true), m("2022-04", 1, 1, 1)])).toEqual([2026, 2022]);
  });

  it("checks the year in the address", () => {
    expect(["2026", "1999"].every(isYear)).toBe(true);
    expect(["26", "abcd", "20266", "1899", "2201"].some(isYear)).toBe(false);
  });
});

describe("yearInputs", () => {
  const bill = (name: string, projected: number) => ({ name, status: "Paid" as const, projected, startBalance: 0 });
  const adhoc = (name: string, projected: number) => ({ name, status: "Paid" as const, projected, tag: "" });
  const inc = (label: string, amount: number) => ({ label, date: "2026-01-02", amount, status: "Received" as const });

  it("leaves Adjustment entries out of income and spending but keeps them in the cushion", () => {
    const month = { ym: "2026-01", bills: [bill("Rent", c(300))], adHoc: [adhoc("Adjustment", c(900)), adhoc("Trip", c(50))], incomes: [inc("Pay", c(1000)), inc(" adjustment ", c(40))], banks: [c(2000)] };
    const [m] = yearInputs([month], new Map([["2026-01", 5]]));
    expect(m).toMatchObject({ ym: "2026-01", income: c(1000), spending: c(350), empty: false });
    // 2000 in the bank, nothing pending or unpaid: the cushion is the bank figure whatever the entries were.
    expect(m.cushion).toBe(c(2000));
  });

  it("marks a month with no rows as empty", () => {
    const [m] = yearInputs([{ ym: "2026-02", bills: [], adHoc: [], incomes: [], banks: [] }], new Map([["2026-02", 0]]));
    expect(m.empty).toBe(true);
    expect(isAdjustment("Adjustments")).toBe(false);
  });
});
