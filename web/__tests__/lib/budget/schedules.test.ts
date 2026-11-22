import { describe, expect, it } from "vitest";
import { scheduleDates } from "@/lib/budget/schedules";

describe("scheduleDates", () => {
  it("weekly: every 7 days from the anchor", () => {
    expect(scheduleDates("weekly", "2026-11-06", "2026-11")).toEqual(["2026-11-06", "2026-11-13", "2026-11-20", "2026-11-27"]);
  });

  it("weekly: keeps the rhythm into later months", () => {
    expect(scheduleDates("weekly", "2026-11-06", "2026-12")).toEqual(["2026-12-04", "2026-12-11", "2026-12-18", "2026-12-25"]);
  });

  it("biweekly: every 14 days, so two or three a month", () => {
    expect(scheduleDates("biweekly", "2026-11-06", "2026-11")).toEqual(["2026-11-06", "2026-11-20"]);
    expect(scheduleDates("biweekly", "2026-11-06", "2026-12")).toEqual(["2026-12-04", "2026-12-18"]);
    expect(scheduleDates("biweekly", "2026-11-06", "2027-01")).toEqual(["2027-01-01", "2027-01-15", "2027-01-29"]);
  });

  it("never produces a date before the anchor", () => {
    expect(scheduleDates("weekly", "2026-11-20", "2026-11")).toEqual(["2026-11-20", "2026-11-27"]);
    expect(scheduleDates("biweekly", "2026-11-20", "2026-10")).toEqual([]);
    expect(scheduleDates("monthly", "2026-11-20", "2026-10")).toEqual([]);
  });

  it("monthly: the anchor's day, or the last day of a short month", () => {
    expect(scheduleDates("monthly", "2026-01-31", "2026-02")).toEqual(["2026-02-28"]);
    expect(scheduleDates("monthly", "2026-01-31", "2028-02")).toEqual(["2028-02-29"]);
    expect(scheduleDates("monthly", "2026-01-15", "2026-06")).toEqual(["2026-06-15"]);
  });

  it("an invalid anchor gives nothing", () => {
    expect(scheduleDates("weekly", "nope", "2026-11")).toEqual([]);
  });
});
