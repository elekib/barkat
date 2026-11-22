"use client";

import { useId, useState } from "react";
import { TableView } from "@/components/charts/Charts";
import { formatCompact, formatMoney } from "@/lib/budget/money";
import { monthLabel } from "@/lib/budget/months";
import type { TrendPoint } from "@/lib/budget/trend";

const W = 960;
const H = 250;
const M = { top: 16, right: 24, bottom: 32, left: 52 };
const PW = W - M.left - M.right;
const PH = H - M.top - M.bottom;

/** A round-number ceiling for the y axis, so ticks read 0 / 1K / 2K. */
function niceMax(cents: number): number {
  const dollars = Math.max(cents / 100, 1);
  const pow = 10 ** Math.floor(Math.log10(dollars));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s * 4 >= dollars) ?? 10 * pow;
  return step * 4 * 100;
}

const SERIES = [
  { key: "income", label: "Income", color: "var(--series-1)" },
  { key: "spending", label: "Spending", color: "var(--series-2)" },
] as const;

/** Income and spending by month on one axis, with a crosshair, a tooltip and a table view. */
export function TrendChart({ points }: { points: TrendPoint[] }) {
  const [active, setActive] = useState<number | null>(null);
  const id = useId();

  if (points.length < 2) {
    return <p className="mt-2 text-sm text-muted">Start another month to see how income and spending move over time.</p>;
  }

  const max = niceMax(Math.max(...points.map((p) => Math.max(p.income, p.spending))));
  const x = (i: number) => M.left + (i / (points.length - 1)) * PW;
  const y = (v: number) => M.top + PH - (v / max) * PH;
  const ticks = [0, 1, 2, 3, 4].map((t) => (max / 4) * t);
  const path = (key: "income" | "spending") => points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p[key])}`).join(" ");
  const short = (ym: string) => monthLabel(ym).slice(0, 3);
  const last = points.length - 1;

  const pick = (clientX: number, el: SVGSVGElement) => {
    const rect = el.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - M.left) / PW) * last);
    setActive(Math.min(Math.max(i, 0), last));
  };

  const tip = active === null ? null : points[active];

  return (
    <div>
      <ul className="mb-1 flex flex-wrap gap-x-4 gap-y-1 text-[0.8125rem] text-ink2">
        {SERIES.map((s) => (
          <li key={s.key} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-[0.1875rem] w-3.5 rounded-sm" style={{ background: s.color }} aria-hidden /> {s.label}
          </li>
        ))}
      </ul>

      <div className="relative">
        <svg
          className="block h-auto w-full touch-pan-y"
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-labelledby={`${id}-t`}
          tabIndex={0}
          onPointerMove={(e) => pick(e.clientX, e.currentTarget)}
          onPointerLeave={() => setActive(null)}
          onBlur={() => setActive(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") setActive((a) => Math.min((a ?? -1) + 1, last));
            if (e.key === "ArrowLeft") setActive((a) => Math.max((a ?? 1) - 1, 0));
            if (e.key === "Escape") setActive(null);
          }}
        >
          <title id={`${id}-t`}>
            {`Income and spending by month, ${monthLabel(points[0].ym)} to ${monthLabel(points[last].ym)}. Use the arrow keys to read each month.`}
          </title>

          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} className={t === 0 ? "stroke-axis" : "stroke-line"} strokeWidth={1} />
              <text x={M.left - 8} y={y(t) + 4} textAnchor="end" className="fill-muted text-[0.6875rem]">
                {formatCompact(t)}
              </text>
            </g>
          ))}

          {points.map((p, i) => (
            <text key={p.ym} x={x(i)} y={H - 10} textAnchor="middle" className="fill-muted text-[0.6875rem]">
              {short(p.ym)}
              {p.ym.endsWith("-01") || i === 0 ? ` ’${p.ym.slice(2, 4)}` : ""}
            </text>
          ))}

          {tip && <line x1={x(active!)} x2={x(active!)} y1={M.top} y2={M.top + PH} className="stroke-axis" strokeWidth={1} />}

          {SERIES.map((s) => (
            <g key={s.key}>
              <path d={path(s.key)} fill="none" stroke={s.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              {points.map((p, i) => (
                <circle
                  key={p.ym}
                  cx={x(i)}
                  cy={y(p[s.key])}
                  r={active === i ? 5 : 4}
                  fill={s.color}
                  className="stroke-surface" strokeWidth={2}
                />
              ))}
            </g>
          ))}
        </svg>

        {tip && (
          <div
            className="glass isolate pointer-events-none absolute top-[8%] min-w-40 rounded-xl border border-line bg-surface px-3 py-2 text-[0.8125rem] shadow-lg"
            role="status"
            style={{ left: `${(x(active!) / W) * 100}%`, transform: active! > last / 2 ? "translateX(calc(-100% - 0.75rem))" : "translateX(0.75rem)" }}
          >
            <div className="mb-1 font-medium text-muted">{monthLabel(tip.ym)}</div>
            {SERIES.map((s) => (
              <div key={s.key} className="flex items-center gap-2">
                <span className="inline-block h-[0.1875rem] w-3.5 rounded-sm" style={{ background: s.color }} aria-hidden />
                <strong className="tabular-nums">{formatMoney(tip[s.key])}</strong>
                <span className="text-muted">{s.label}</span>
              </div>
            ))}
            <div className="mt-1.5 flex items-center justify-between gap-3 border-t border-line pt-1.5">
              <span className="text-muted">Cushion</span>
              <strong className="tabular-nums">{formatMoney(tip.cushion)}</strong>
            </div>
          </div>
        )}
      </div>

      <TableView>
        <thead>
          <tr className="text-left text-muted">
            <th scope="col" className="py-1 pr-3 font-medium">Month</th>
            <th scope="col" className="py-1 pr-3 font-medium">Income</th>
            <th scope="col" className="py-1 pr-3 font-medium">Spending</th>
            <th scope="col" className="py-1 font-medium">Cushion</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.ym}>
              <th scope="row" className="py-1 pr-3 text-left font-normal">{monthLabel(p.ym)}</th>
              <td className="py-1 pr-3">{formatMoney(p.income)}</td>
              <td className="py-1 pr-3">{formatMoney(p.spending)}</td>
              <td className="py-1">{formatMoney(p.cushion)}</td>
            </tr>
          ))}
        </tbody>
      </TableView>
    </div>
  );
}
