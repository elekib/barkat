const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/**
 * Month from a sheet name or title: "December", "Dec 2026", "December 2026",
 * "2026-12", "12/2026". A name with no year uses `defaultYear`. Null if it is not a month.
 */
export function parseMonthName(text: string, defaultYear: number): string | null {
  const s = text.trim().toLowerCase();
  if (!s) return null;

  const iso = /^(\d{4})[-/.](\d{1,2})$/.exec(s) ?? /^(\d{1,2})[-/.](\d{4})$/.exec(s);
  if (iso) {
    const [a, b] = [Number(iso[1]), Number(iso[2])];
    const [y, m] = a > 31 ? [a, b] : [b, a];
    return m >= 1 && m <= 12 ? ym(y, m) : null;
  }

  const word = /[a-z]+/.exec(s)?.[0];
  if (!word || word.length < 3) return null;
  const index = monthIndex(word);
  if (index < 0) return null;
  const year = /\b(\d{4})\b/.exec(s);
  return ym(year ? Number(year[1]) : defaultYear, index + 1);
}

function ym(y: number, m: number): string {
  return `${y}-${String(m).padStart(2, "0")}`;
}

/** Exact name, an abbreviation ("jan", "sept"), or a long word within two typos of a name ("feburary"). */
function monthIndex(word: string): number {
  const exact = MONTHS.findIndex((m) => m === word || (word.length <= 4 && m.startsWith(word)));
  if (exact >= 0) return exact;
  if (word.length < 5) return -1;
  return MONTHS.findIndex((m) => m[0] === word[0] && distance(word, m) <= 2);
}

function distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}
