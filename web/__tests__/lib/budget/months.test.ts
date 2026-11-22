import { describe, expect, it } from "vitest";
import { currentYm, isYm, monthLabel, shiftYm } from "@/lib/budget/months";

describe("months", () => {
  it("validates", () => {
    expect(isYm("2026-12")).toBe(true);
    expect(isYm("2026-13")).toBe(false);
    expect(isYm("2026-1")).toBe(false);
  });
  it("shifts across years", () => {
    expect(shiftYm("2026-12", 1)).toBe("2027-01");
    expect(shiftYm("2026-01", -1)).toBe("2025-12");
    expect(shiftYm("2026-06", 0)).toBe("2026-06");
  });
  it("labels and reads the current month", () => {
    expect(monthLabel("2026-12")).toBe("December 2026");
    expect(currentYm(new Date(2026, 10, 21))).toBe("2026-11");
  });
});

describe("dateInMonth", () => {
  it("holds a day to the month's last day", async () => {
    const { dateInMonth, monthEnd } = await import("@/lib/budget/months");
    expect(dateInMonth("2026-12", 7)).toBe("2026-12-07");
    expect(dateInMonth("2026-02", 31)).toBe("2026-02-28");
    expect(dateInMonth("2028-02", 30)).toBe("2028-02-29");
    expect(monthEnd("2026-04")).toBe("2026-04-30");
  });
});
