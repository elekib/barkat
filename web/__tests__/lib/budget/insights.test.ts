import { describe, expect, it } from "vitest";
import { findInsights, forecast, overviewInsights, insightMonths, insightReport, type InsightMonth } from "@/lib/budget/insights";
import type { MonthInput } from "@/lib/budget/trend";

const c = (d: number) => d * 100;
const month = (ym: string, bills: Record<string, number>, income = 3000, cushion = 500): InsightMonth => {
  const items = new Map(Object.entries(bills).map(([n, a]) => [n.toLowerCase(), { name: n, amount: c(a) }]));
  return { ym, income: c(income), spending: [...items.values()].reduce((a, i) => a + i.amount, 0), cushion: c(cushion), items };
};
const steady = (n: number) => Array.from({ length: n }, (_, i) => month(`2026-0${i + 1}`, { Rent: 1000, Power: 100, Net: 50 }));

describe("forecast", () => {
  it("needs three months", () => expect(forecast(steady(2))).toEqual([]));
  it("projects the cushion by the average net, with a range", () => {
    const h = [month("2026-01", { Rent: 2000 }, 3000, 0), month("2026-02", { Rent: 2500 }, 3000, 0), month("2026-03", { Rent: 2000 }, 3000, 1000)];
    const f = forecast(h, 2);
    expect(f.map((x) => x.ym)).toEqual(["2026-04", "2026-05"]);
    expect(f[0]).toMatchObject({ low: c(1000) + c(500), high: c(1000) + c(1000) });
    expect(f[0].expected).toBe(Math.round(c(1000) + (c(1000) + c(500) + c(1000)) / 3));
    expect(f[1].low).toBe(c(1000) + 2 * c(500));
  });
});

describe("findInsights", () => {
  it("is quiet with a steady history", () => expect(findInsights([...steady(5), month("2026-06", { Rent: 1000, Power: 100, Net: 50 })])).toEqual([]));
  it("needs history", () => expect(findInsights(steady(3))).toEqual([]));

  it("flags a bill far above its usual amount, not a small drift", () => {
    const out = findInsights([...steady(5), month("2026-06", { Rent: 1000, Power: 180, Net: 52 })]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: "bill-change", severity: "warn", ym: "2026-06" });
    expect(out[0].title).toBe("Power is 80% higher than usual");
  });

  it("flags a recurring bill that is missing, and a new one", () => {
    const out = findInsights([...steady(5), month("2026-06", { Rent: 1000, Power: 100, Gym: 40 })]);
    expect(out.map((i) => i.kind).sort()).toEqual(["bill-missing", "bill-new"]);
  });

  it("flags a spending spike", () => {
    const h = [...steady(5), month("2026-06", { Rent: 1000, Power: 100, Net: 50, Trip: 900 })];
    expect(findInsights(h).map((i) => i.kind)).toContain("spending-spike");
  });
});

describe("insightReport", () => {
  it("ignores months after now and warns when the cushion heads below zero", () => {
    const h = [month("2026-01", { Rent: 3500 }, 3000, 100), month("2026-02", { Rent: 3500 }, 3000, 0), month("2026-03", { Rent: 3500 }, 3000, -300), month("2027-01", { Rent: 1 })];
    const r = insightReport(h, "2026-03");
    expect(r.latest).toBe("2026-03");
    expect(r.averageNet).toBe(c(-500));
    expect(r.insights.some((i) => i.kind === "overdraw")).toBe(true);
  });
  it("is empty without history", () => expect(insightReport([], "2026-03")).toMatchObject({ latest: null, forecast: [], insights: [] }));
});

describe("insightMonths", () => {
  it("drops empty months, merges same-named rows and leaves out None and Adjustment", () => {
    const bill = (name: string, projected: number, status: "Pending" | "None" = "Pending") => ({ name, projected: c(projected), status, startBalance: 0 });
    const months: MonthInput[] = [
      { ym: "2026-01", bills: [bill("Rent", 500), bill("rent ", 100), bill("Old", 9, "None")], adHoc: [{ name: "Adjustment", projected: c(50), status: "Pending" }], incomes: [], banks: [] },
      { ym: "2026-02", bills: [], adHoc: [], incomes: [], banks: [] },
    ];
    const out = insightMonths(months, new Map([["2026-01", 4], ["2026-02", 0]]));
    expect(out).toHaveLength(1);
    expect([...out[0].items.values()]).toEqual([{ name: "Rent", amount: c(600) }]);
    expect(out[0].spending).toBe(c(600));
  });
});

describe("overviewInsights", () => {
  const book = (spaceId: number, name: string, months: InsightMonth[]) => ({ spaceId, name, report: insightReport(months, "2026-12") });
  it("rolls findings up with warnings first, and adds the next-month forecasts", () => {
    const calm = book(1, "Home", steady(6));
    const spiky = book(2, "Parents", [...steady(5), month("2026-06", { Rent: 1000, Power: 180, Net: 50 })]);
    const o = overviewInsights([calm, spiky, book(3, "New", steady(2))]);
    expect(o.books).toBe(2);
    expect(o.total).toBe(1);
    expect(o.warns).toBe(1);
    expect(o.top[0]).toMatchObject({ spaceId: 2, book: "Parents" });
    expect(o.net).toBe(calm.report.averageNet! + spiky.report.averageNet!);
    expect(o.next?.ym).toBe("2026-07");
    expect(o.next?.expected).toBe(calm.report.forecast[0].expected + spiky.report.forecast[0].expected);
  });
  it("is empty with no usable books", () => {
    expect(overviewInsights([])).toEqual({ books: 0, total: 0, warns: 0, top: [], net: null, next: null });
  });
});
