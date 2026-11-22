import type { ReactNode } from "react";
import type { IconType } from "react-icons";
import { IconChip } from "@/components/IconChip";
import { card } from "@/components/ui";
import { formatMoney } from "@/lib/budget/money";
import type { Cents } from "@/lib/budget/types";

/**
 * Small server-rendered charts. Marks are thin, bars have a rounded data end and
 * a square baseline, touching marks are separated by a surface-coloured gap.
 * Every value is also in the mark's title and, for the segmented bar, a table.
 */

const empty = "mt-2 text-sm text-muted";

/* ---------- ranked horizontal bars ---------- */

export interface RankedItem {
  label: string;
  value: Cents;
}

/** Compare magnitudes: one hue, largest first, the value at the tip. */
export function RankedBars({ items, emptyText }: { items: RankedItem[]; emptyText: string }) {
  if (items.length === 0) return <p className={empty}>{emptyText}</p>;
  const max = Math.max(...items.map((i) => Math.abs(i.value)), 1);
  return (
    <ul className="grid gap-3">
      {items.map((item, i) => (
        <li
          key={`${item.label}-${i}`}
          title={`${item.label}: ${formatMoney(item.value)}`}
          className="group grid grid-cols-[minmax(5rem,9rem)_1fr_auto] items-center gap-3 text-sm"
        >
          <span className="truncate text-ink2">{item.label}</span>
          <span className="flex h-3.5 items-center border-l border-axis">
            <i
              className="block h-3.5 rounded-r bg-series1 transition group-hover:brightness-110"
              style={{ width: `${Math.max((Math.abs(item.value) / max) * 100, 1.5)}%` }}
            />
          </span>
          <span className="min-w-[5.5rem] text-right font-semibold tabular-nums">{formatMoney(item.value)}</span>
        </li>
      ))}
    </ul>
  );
}

/* ---------- tall segmented bar ---------- */

export interface SegPart {
  key: string;
  label: string;
  /** Mark in the legend, so state is never colour alone. */
  glyph: ReactNode;
  value: Cents;
  /** CSS custom property name holding the fill, e.g. "--st-paid". */
  color: string;
}

/** One whole split into a few parts: widths proportional, shares inside where they fit. */
export function SegmentedBar({ parts, emptyText }: { parts: SegPart[]; emptyText: string }) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  const shown = parts.filter((p) => p.value > 0);
  if (total <= 0) return <p className={empty}>{emptyText}</p>;
  const summary = shown.map((p) => `${p.label} ${formatMoney(p.value)}`).join(", ");
  return (
    <div>
      <div className="flex h-7 gap-0.5" role="img" aria-label={summary}>
        {shown.map((p) => {
          const share = (p.value / total) * 100;
          return (
            <span
              key={p.key}
              className="flex min-w-0 items-center overflow-hidden whitespace-nowrap rounded px-2 text-xs font-semibold transition hover:brightness-110"
              style={{ width: `${share}%`, background: `var(${p.color})`, color: `var(--on-${p.key})` }}
              title={`${p.label}: ${formatMoney(p.value)} (${Math.round(share)}%)`}
            >
              {share >= 14 ? `${Math.round(share)}%` : null}
            </span>
          );
        })}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[0.8125rem] text-ink2">
        {shown.map((p) => (
          <li key={p.key} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-[0.1875rem]" style={{ background: `var(${p.color})` }} aria-hidden />
            <span aria-hidden className="inline-flex align-middle text-sm">{p.glyph}</span> {p.label}
          </li>
        ))}
      </ul>
      <TableView>
        <tbody>
          {shown.map((p) => (
            <tr key={p.key}>
              <th scope="row" className="py-1 pr-3 text-left font-normal">{p.label}</th>
              <td className="py-1 pr-3">{formatMoney(p.value)}</td>
              <td className="py-1">{Math.round((p.value / total) * 100)}%</td>
            </tr>
          ))}
        </tbody>
      </TableView>
    </div>
  );
}

/** A collapsed table of the same numbers, for screen readers and anyone who prefers digits. */
export function TableView({ children }: { children: ReactNode }) {
  return (
    <details className="mt-3 text-[0.8125rem] text-ink2">
      <summary className="w-max cursor-pointer text-muted">Table view</summary>
      <table className="mt-2 w-full border-collapse tabular-nums">{children}</table>
    </details>
  );
}

/* ---------- meter ---------- */

/** One ratio against its whole. The track is a lighter step of the fill's own colour. */
export function Meter({ value, label }: { value: number | null; label: string }) {
  const pct = value === null ? 0 : Math.min(Math.max(value, 0), 1) * 100;
  return (
    <div
      className="my-1 h-2 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--fill)_18%,var(--surface))]"
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
    >
      <i className="block h-full rounded-full bg-[var(--fill)]" style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ---------- stat tile ---------- */

/** A soft corner gradient per tile. Full class strings so Tailwind can see them. */
const TILE_GLOW = {
  none: "bg-[linear-gradient(135deg,color-mix(in_srgb,var(--accent)_var(--glow),transparent),transparent_65%)]",
  good: "bg-[linear-gradient(135deg,color-mix(in_srgb,var(--good)_var(--glow),transparent),transparent_65%)]",
  bad: "bg-[linear-gradient(135deg,color-mix(in_srgb,var(--bad)_var(--glow),transparent),transparent_65%)]",
} as const;

export function Tile({
  label,
  value,
  note,
  tone,
  icon,
  children,
}: {
  icon?: IconType;
  label: string;
  value: string;
  note?: ReactNode;
  tone?: "good" | "bad";
  children?: ReactNode;
}) {
  return (
    <div className={`${card} flex flex-col gap-1 p-4 transition hover:border-axis ${TILE_GLOW[tone ?? "none"]}`}>
      <span className="flex items-center gap-2 text-[0.8125rem] font-medium text-muted">
        {icon && <IconChip icon={icon} size="sm" />}
        {label}
      </span>
      <strong
        className={`break-words text-2xl font-bold leading-tight tracking-tight ${tone === "good" ? "text-good-bright" : tone === "bad" ? "text-bad-bright" : ""}`}
      >
        {value}
      </strong>
      {children}
      {note && <span className="text-[0.8125rem] text-muted">{note}</span>}
    </div>
  );
}
