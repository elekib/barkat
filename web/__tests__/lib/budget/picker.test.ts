import { describe, expect, it } from "vitest";
import { pickerYear, pickerYears } from "@/lib/budget/picker";

describe("month picker", () => {
  const sizes = new Map([["2026-01", 12], ["2026-02", 0], ["2025-12", 3]]);

  it("marks months with data, empty months and months not started", () => {
    const cells = pickerYear(2026, sizes, "2026-11", "2026-01");
    expect(cells).toHaveLength(12);
    expect(cells.slice(0, 3).map((c) => c.state)).toEqual(["data", "empty", "none"]);
    expect(cells[10]).toMatchObject({ ym: "2026-11", name: "November", isCurrent: true, isShown: false, state: "none" });
    expect(cells[0]).toMatchObject({ isShown: true, isCurrent: false, label: "January 2026" });
  });

  it("offers every year from the first month to now, without holes", () => {
    expect(pickerYears(["2026-01", "2022-05"], "2026-11", "2026-01")).toEqual([2022, 2023, 2024, 2025, 2026]);
  });

  it("always includes this year and the year on screen", () => {
    expect(pickerYears([], "2026-11", "2026-11")).toEqual([2026]);
    expect(pickerYears(["2026-01"], "2026-11", "2029-02")).toEqual([2026, 2027, 2028, 2029]);
    expect(pickerYears(["2026-01"], "2026-11", "2021-02")).toEqual([2021, 2022, 2023, 2024, 2025, 2026]);
  });
});
