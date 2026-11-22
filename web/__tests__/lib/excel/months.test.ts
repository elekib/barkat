import { describe, expect, it } from "vitest";
import { parseMonthName } from "@/lib/excel/months";

describe("parseMonthName", () => {
  it("reads a month name and uses the default year", () => {
    expect(parseMonthName("December", 2026)).toBe("2026-12");
    expect(parseMonthName(" jan ", 2027)).toBe("2027-01");
    expect(parseMonthName("Sept", 2026)).toBe("2026-09");
  });
  it("forgives small typos in long names", () => {
    expect(parseMonthName("Feburary", 2026)).toBe("2026-02");
    expect(parseMonthName("Febuary 2025", 2026)).toBe("2025-02");
    expect(parseMonthName("Decmber", 2026)).toBe("2026-12");
    expect(parseMonthName("Septmber", 2026)).toBe("2026-09");
  });
  it("prefers a year in the name", () => {
    expect(parseMonthName("December 2025", 2026)).toBe("2025-12");
    expect(parseMonthName("Dec-2025", 2026)).toBe("2025-12");
  });
  it("reads numeric forms", () => {
    expect(parseMonthName("2026-03", 2000)).toBe("2026-03");
    expect(parseMonthName("3/2026", 2000)).toBe("2026-03");
  });
  it("rejects things that are not months", () => {
    expect(parseMonthName("Summary", 2026)).toBeNull();
    expect(parseMonthName("Mayhem", 2026)).toBeNull();
    expect(parseMonthName("Marketing", 2026)).toBeNull();
    expect(parseMonthName("Budget", 2026)).toBeNull();
    expect(parseMonthName("2026-13", 2026)).toBeNull();
    expect(parseMonthName("", 2026)).toBeNull();
  });
});
