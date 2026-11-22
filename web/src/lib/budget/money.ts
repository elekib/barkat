import type { Cents } from "./types";

/**
 * Parse what a person types into whole cents: "1,234.5", "$12", "-40.25", "(40)".
 * Returns null when it is not a number. Never goes through float arithmetic.
 */
export function parseMoney(input: string): Cents | null {
  if (input.trim() === "") return 0;
  let s = input.replace(/[$,\s]/g, "");
  if (s === "") return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  }
  const m = /^(\d*)(?:\.(\d{0,2})\d*)?$/.exec(s);
  if (!m || (m[1] === "" && (m[2] ?? "") === "")) return null;
  const whole = Number(m[1] || "0");
  const frac = Number((m[2] ?? "").padEnd(2, "0"));
  const cents = whole * 100 + frac;
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** Whole cents to "$1,234.50". */
export function formatMoney(cents: Cents): string {
  return usd.format(cents / 100);
}

/** Whole cents to a plain editable string: "1234.50", or "" for zero. */
export function editableMoney(cents: Cents): string {
  if (cents === 0) return "";
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Short form for axes and tight spaces: $950, $1.2K, $3.5M. */
export function formatCompact(cents: Cents): string {
  const sign = cents < 0 ? "-" : "";
  const dollars = Math.abs(cents) / 100;
  if (dollars >= 1_000_000) return `${sign}$${trim(dollars / 1_000_000)}M`;
  if (dollars >= 1_000) return `${sign}$${trim(dollars / 1_000)}K`;
  return `${sign}$${Math.round(dollars)}`;
}

function trim(n: number): string {
  return n.toFixed(1).replace(/\.0$/, "");
}
