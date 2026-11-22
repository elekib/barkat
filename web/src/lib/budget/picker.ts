import { monthLabel } from "./months";

/**
 * What the month picker shows. A month is "data" when it has rows, "empty" when it was started but holds
 * nothing, and "none" when it has not been started (opening it offers to start it).
 */
export type MonthState = "data" | "empty" | "none";

export interface PickerMonth {
  ym: string;
  /** 1 to 12. */
  month: number;
  /** "March", for the grid; the full "March 2026" is `label`. */
  name: string;
  label: string;
  state: MonthState;
  isCurrent: boolean;
  isShown: boolean;
}

/** The twelve months of `year`, each with its state. `sizes` maps a started month to how many rows it holds. */
export function pickerYear(year: number, sizes: ReadonlyMap<string, number>, now: string, shown: string): PickerMonth[] {
  return Array.from({ length: 12 }, (_, i) => {
    const ym = `${year}-${String(i + 1).padStart(2, "0")}`;
    const items = sizes.get(ym);
    const label = monthLabel(ym);
    return {
      ym,
      month: i + 1,
      name: label.split(" ")[0],
      label,
      state: items === undefined ? "none" : items > 0 ? "data" : "empty",
      isCurrent: ym === now,
      isShown: ym === shown,
    };
  });
}

/**
 * Every year from the earliest started month to the latest, with this year and the one on screen always
 * included, so a book that starts in 2019 offers 2019 up to now with no holes.
 */
export function pickerYears(started: readonly string[], now: string, shown: string): number[] {
  const years = [...started, now, shown].map((ym) => Number(ym.slice(0, 4)));
  const low = Math.min(...years);
  const high = Math.max(...years);
  return Array.from({ length: high - low + 1 }, (_, i) => low + i);
}
