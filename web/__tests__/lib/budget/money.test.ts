import { describe, expect, it } from "vitest";
import { editableMoney, formatCompact, formatMoney, parseMoney } from "@/lib/budget/money";

describe("parseMoney", () => {
  it.each([
    ["12", 1200],
    ["$1,234.50", 123450],
    ["0.1", 10],
    [".5", 50],
    ["-40.25", -4025],
    ["(40)", -4000],
    ["  7.999 ", 799],
    ["", 0],
  ])("parses %j", (input, cents) => {
    expect(parseMoney(input)).toBe(cents);
  });

  it.each(["abc", "1.2.3", "--5", "$", "."])("rejects %j", (input) => {
    expect(parseMoney(input)).toBeNull();
  });

  it("avoids float error", () => {
    expect(parseMoney("19.99")).toBe(1999);
    expect(parseMoney("0.07")).toBe(7);
  });
});

describe("formatting", () => {
  it("formats cents as dollars", () => {
    expect(formatMoney(123450)).toBe("$1,234.50");
    expect(formatMoney(-500)).toBe("-$5.00");
  });

  it("round-trips through the editable form", () => {
    for (const cents of [0, 5, 100, 123450, -4025]) {
      expect(parseMoney(editableMoney(cents))).toBe(cents);
    }
    expect(editableMoney(0)).toBe("");
  });
});

describe("formatCompact", () => {
  it.each([
    [0, "$0"],
    [95000, "$950"],
    [120000, "$1.2K"],
    [200000, "$2K"],
    [350000000, "$3.5M"],
    [-120000, "-$1.2K"],
  ])("formats %d cents as %s", (cents, text) => {
    expect(formatCompact(cents)).toBe(text);
  });
});
