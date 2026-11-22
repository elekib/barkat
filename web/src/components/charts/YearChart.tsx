import Link from "next/link";
import { formatCompact, formatMoney } from "@/lib/budget/money";
import { monthLabel } from "@/lib/budget/months";
import { niceMax } from "@/lib/budget/trend";
import type { YearView } from "@/lib/budget/year";

const SERIES = [
  { key: "income", label: "Income", bar: "bg-series1", swatch: "var(--series-1)" },
  { key: "spending", label: "Spending", bar: "bg-series2", swatch: "var(--series-2)" },
] as const;

/**
 * Income and spending for each month of a year, side by side, on one axis. Each month is a link to its page
 * (a month with no data says so and opens the page that offers to start it). Plain HTML, so the labels keep
 * their size on a phone. The numbers are in each link's label, and the table under the chart has them too.
 */
export function YearChart({ view, spaceId, describedBy }: { view: YearView; spaceId: number; describedBy: string }) {
  const max = niceMax(Math.max(...view.months.map((m) => Math.max(m.income, m.spending)), 0));
  const ticks = [4, 3, 2, 1, 0].map((t) => (max / 4) * t);
  return (
    <div>
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.8125rem] text-ink2">
        {SERIES.map((s) => (
          <li key={s.key} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-[0.1875rem]" style={{ background: s.swatch }} aria-hidden /> {s.label}
          </li>
        ))}
      </ul>

      <div className="grid grid-cols-[2.75rem_1fr] gap-x-1">
        {/* y axis: ticks line up with the gridlines behind the bars */}
        <div className="relative h-56" aria-hidden>
          {ticks.map((t, i) => (
            <span key={t} className="absolute right-1 -translate-y-1/2 text-[0.6875rem] tabular-nums text-muted" style={{ top: `${i * 25}%` }}>
              {formatCompact(t)}
            </span>
          ))}
        </div>
        <div className="relative">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-56" aria-hidden>
            {ticks.map((t, i) => (
              <div key={t} className={`absolute inset-x-0 border-t ${t === 0 ? "border-axis" : "border-line"}`} style={{ top: `${i * 25}%` }} />
            ))}
          </div>
          <ul aria-label="Months" aria-describedby={describedBy} className="relative grid grid-cols-12 gap-0.5 sm:gap-1.5">
            {view.months.map((m) => {
              const label =
                m.status === "data"
                  ? `${monthLabel(m.ym)}: income ${formatMoney(m.income)}, spending ${formatMoney(m.spending)}. Open the month.`
                  : `${monthLabel(m.ym)}: ${m.status === "empty" ? "started, with nothing in it" : "not started"}. Open the month.`;
              return (
                <li key={m.ym} className="min-w-0">
                  <Link
                    href={`/s/${spaceId}/${m.ym}`}
                    aria-label={label}
                    title={label.replace(" Open the month.", "")}
                    className="group flex flex-col rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <span className="flex h-56 items-end justify-center gap-px rounded-t-md group-hover:bg-[color-mix(in_srgb,var(--ink)_6%,transparent)] sm:gap-0.5">
                      {m.status === "data" ? (
                        SERIES.map((s) => (
                          <i
                            key={s.key}
                            className={`block w-full max-w-3.5 rounded-t ${s.bar} transition group-hover:brightness-110`}
                            style={{ height: `${Math.max((m[s.key] / max) * 100, m[s.key] > 0 ? 1.5 : 0)}%` }}
                          />
                        ))
                      ) : (
                        <span className="mb-1 text-[0.6875rem] text-muted">–</span>
                      )}
                    </span>
                    <span className={`pt-1 text-center text-[0.6875rem] sm:text-xs ${m.status === "data" ? "font-medium text-ink2" : "text-muted"}`}>
                      <span className="sm:hidden">{monthLabel(m.ym)[0]}</span>
                      <span className="hidden sm:inline">{monthLabel(m.ym).slice(0, 3)}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
