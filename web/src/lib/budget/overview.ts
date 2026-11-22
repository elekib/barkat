import { formatMoney } from "./money";
import type { DueStatus } from "./metrics";
import type { Cents } from "./types";

/** One space's current month, boiled down for the Overview page. */
export interface SpaceSnapshot {
  id: number;
  name: string;
  /** False when the month has not been started. */
  started: boolean;
  accounts: number;
  bankTotal: Cents;
  cushion: Cents;
  /** Bills and one-offs still to pay. */
  toPay: Cents;
  /** Income still to arrive. */
  incomeToArrive: Cents;
  /** Share of planned spending already paid, 0 to 1. Null with nothing planned. */
  paidShare: number | null;
  due: DueStatus;
}

export interface Totals {
  spaces: number;
  started: number;
  cushion: Cents;
  bankTotal: Cents;
  toPay: Cents;
  incomeToArrive: Cents;
}

/** Overall numbers across every space that has its month started. */
export function totals(spaces: SpaceSnapshot[]): Totals {
  const live = spaces.filter((s) => s.started);
  const sum = (pick: (s: SpaceSnapshot) => Cents) => live.reduce((a, s) => a + pick(s), 0);
  return {
    spaces: spaces.length,
    started: live.length,
    cushion: sum((s) => s.cushion),
    bankTotal: sum((s) => s.bankTotal),
    toPay: sum((s) => s.toPay),
    incomeToArrive: sum((s) => s.incomeToArrive),
  };
}

export type SuggestionLevel = "bad" | "warn" | "info";

export interface Suggestion {
  level: SuggestionLevel;
  spaceId: number;
  title: string;
  detail: string;
}

const RANK: Record<SuggestionLevel, number> = { bad: 0, warn: 1, info: 2 };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function when(days: number | null): string {
  if (days === null) return "";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

/**
 * What deserves a look, most urgent first: late bills, bills due within a few days, a negative
 * cushion, then housekeeping (a month not started, a space with no accounts).
 */
export function suggestions(spaces: SpaceSnapshot[], monthName: string, limit = 6): Suggestion[] {
  const out: Suggestion[] = [];
  for (const s of spaces) {
    if (!s.started) {
      out.push({ level: "info", spaceId: s.id, title: `${s.name}: ${monthName} has not been started`, detail: "Open it to start the month from the last one." });
      continue;
    }
    if (s.due.level === "overdue") {
      const more = s.due.overdueCount > 1 ? ` and ${plural(s.due.overdueCount - 1, "other bill")}` : "";
      const late = s.due.days === null ? "" : ` ${plural(-s.due.days, "day")} late`;
      out.push({ level: "bad", spaceId: s.id, title: `${s.name}: ${s.due.name}${more} overdue`, detail: `Mark it paid or payment made once it goes out.${late ? ` Latest first: ${s.due.name},${late}.` : ""}` });
    } else if (s.due.level === "soon") {
      out.push({ level: "warn", spaceId: s.id, title: `${s.name}: ${s.due.name} is due ${when(s.due.days)}`, detail: `${plural(s.due.openCount, "bill")} still to pay.` });
    }
    if (s.cushion < 0) {
      out.push({ level: "bad", spaceId: s.id, title: `${s.name}: cushion is ${formatMoney(s.cushion)}`, detail: "Bills and one-offs add up to more than the money and income expected." });
    }
    if (s.accounts === 0) {
      out.push({ level: "info", spaceId: s.id, title: `${s.name}: no accounts yet`, detail: "Add the bank accounts so the cushion and per-account split are right." });
    }
  }
  return out.sort((a, b) => RANK[a.level] - RANK[b.level]).slice(0, limit);
}
