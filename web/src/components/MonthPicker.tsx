"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { MdCalendarMonth, MdChevronLeft, MdChevronRight, MdClose, MdDeleteOutline, MdExpandMore, MdInsights } from "react-icons/md";
import { monthLabel } from "@/lib/budget/months";
import { pickerYear, pickerYears, type MonthState } from "@/lib/budget/picker";
import { CLEAR_MONTH_DIALOG } from "./ClearMonth";
import { focus, input } from "./ui";

/** The words that go with each state, so a month is never told apart by colour alone. */
const STATE: Record<MonthState, { word: string; cell: string }> = {
  data: { word: "Started", cell: "border-line bg-surface2 text-ink" },
  empty: { word: "Empty", cell: "border-dashed border-axis bg-surface text-ink2" },
  none: { word: "Not started", cell: "border-line bg-surface text-muted" },
};

/**
 * The month in the pinned header, as a button that opens a calendar of years and months. Each month says
 * whether it has data, is empty or has not been started, and the current month is marked. A month that has
 * not been started opens the "start this month" card. Arrow keys move between months, PageUp and PageDown
 * change the year, Escape closes.
 */
export function MonthPicker({ spaceId, ym, now, months, canClear = false }: { spaceId: number; ym: string; now: string; months: { ym: string; items: number }[]; canClear?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const grid = useRef<HTMLUListElement>(null);
  const [year, setYear] = useState(Number(ym.slice(0, 4)));

  const sizes = useMemo(() => new Map(months.map((m) => [m.ym, m.items])), [months]);
  const years = useMemo(() => pickerYears(months.map((m) => m.ym), now, ym), [months, now, ym]);
  const cells = pickerYear(year, sizes, now, ym);
  const started = (y: number) => months.filter((m) => m.ym.startsWith(`${y}-`)).length;
  const lo = years[0];
  const hi = years[years.length - 1];
  const go = (y: number) => setYear(Math.min(Math.max(y, lo), hi));

  const open = () => {
    setYear(Number(ym.slice(0, 4)));
    dialog.current?.showModal();
    // Land on the month on screen (or the first of the year) so the keyboard starts somewhere useful.
    requestAnimationFrame(() => (grid.current?.querySelector<HTMLElement>("[aria-current='page']") ?? grid.current?.querySelector<HTMLElement>("a"))?.focus());
  };
  const close = () => dialog.current?.close();
  // Hand over to the clear-month confirmation, which lives on the page, not in this dialog.
  const clearMonth = () => {
    close();
    (document.getElementById(CLEAR_MONTH_DIALOG) as HTMLDialogElement | null)?.showModal();
  };

  const onKeys = (e: React.KeyboardEvent) => {
    const links = [...(grid.current?.querySelectorAll<HTMLElement>("a") ?? [])];
    const at = links.indexOf(document.activeElement as HTMLElement);
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 }[e.key];
    if (step !== undefined && at >= 0) {
      e.preventDefault();
      links[Math.min(Math.max(at + step, 0), links.length - 1)]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      links[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      links[links.length - 1]?.focus();
    } else if (e.key === "PageUp" || e.key === "PageDown") {
      e.preventDefault();
      const keepAt = Math.max(at, 0);
      go(year + (e.key === "PageUp" ? -1 : 1));
      requestAnimationFrame(() => grid.current?.querySelectorAll<HTMLElement>("a")[keepAt]?.focus());
    }
  };

  return (
    <>
      <h1 className="shrink-0 whitespace-nowrap text-2xl font-bold tracking-tight">
        <button
          type="button"
          onClick={open}
          aria-haspopup="dialog"
          aria-label={`${monthLabel(ym)}. Choose another month`}
          className={`group -mx-1.5 flex max-w-full items-center gap-1 rounded-lg px-1.5 text-left hover:bg-surface2 ${focus}`}
        >
          <span>{monthLabel(ym)}</span>
          <MdExpandMore className="h-6 w-6 shrink-0 text-muted group-hover:text-ink" aria-hidden />
        </button>
      </h1>

      <dialog
        ref={dialog}
        aria-labelledby="picker-title"
        onClick={(e) => e.target === dialog.current && close()}
        className="glass isolate m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-0 text-ink shadow-card backdrop:bg-black/50"
      >
        <div onKeyDown={onKeys} className="flex max-h-[90vh] flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <h2 id="picker-title" className="flex items-center gap-2 text-base font-semibold tracking-tight">
              <MdCalendarMonth className="h-5 w-5 text-muted" aria-hidden />
              Go to a month
            </h2>
            <button type="button" onClick={close} aria-label="Close" className={`rounded-md p-1 text-muted hover:text-ink ${focus}`}>
              <MdClose className="h-5 w-5" />
            </button>
          </div>

          <div className="flex items-center justify-between gap-2 px-4 pt-3">
            <button type="button" onClick={() => go(year - 1)} disabled={year <= lo} aria-label="Previous year" className={`grid h-10 w-10 place-items-center rounded-lg border border-line text-ink2 hover:bg-surface2 disabled:opacity-40 ${focus}`}>
              <MdChevronLeft className="h-5 w-5" aria-hidden />
            </button>
            <label className="flex-1">
              <span className="sr-only">Year</span>
              <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={`${input} select-arrow bg-surface text-center text-base font-semibold`}>
                {years
                  .slice()
                  .reverse()
                  .map((y) => (
                    <option key={y} value={y}>
                      {y}
                      {started(y) > 0 ? ` · ${started(y)} month${started(y) === 1 ? "" : "s"}` : ""}
                    </option>
                  ))}
              </select>
            </label>
            <button type="button" onClick={() => go(year + 1)} disabled={year >= hi} aria-label="Next year" className={`grid h-10 w-10 place-items-center rounded-lg border border-line text-ink2 hover:bg-surface2 disabled:opacity-40 ${focus}`}>
              <MdChevronRight className="h-5 w-5" aria-hidden />
            </button>
          </div>

          <ul ref={grid} aria-label={`Months of ${year}`} className="grid grid-cols-3 gap-2 overflow-y-auto px-4 py-3">
            {cells.map((c) => (
              <li key={c.ym}>
                <Link
                  href={`/s/${spaceId}/${c.ym}`}
                  onClick={close}
                  aria-current={c.isShown ? "page" : undefined}
                  aria-label={`${c.label}: ${STATE[c.state].word.toLowerCase()}${c.isCurrent ? ", this month" : ""}${c.isShown ? ", showing now" : ""}`}
                  className={`flex min-h-[4.25rem] flex-col justify-center rounded-xl border px-2.5 py-1.5 transition hover:border-accent ${STATE[c.state].cell} ${c.isShown ? "ring-2 ring-accent" : ""} ${focus}`}
                >
                  <span className="flex items-center justify-between gap-1 text-sm font-semibold">
                    {c.name.slice(0, 3)}
                    {c.isCurrent && <span className="rounded-full bg-accent px-1.5 py-px text-[0.625rem] font-bold uppercase tracking-wide text-accent-ink">Now</span>}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1 text-[0.75rem]">
                    <span aria-hidden className={`inline-block h-2 w-2 shrink-0 rounded-full ${c.state === "data" ? "bg-accent" : c.state === "empty" ? "border border-accent" : "border border-dashed border-muted"}`} />
                    {STATE[c.state].word}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t border-line px-4 py-3">
            <Link href={`/s/${spaceId}/year/${year}`} onClick={close} className={`inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-medium text-accent hover:border-accent ${focus}`}>
              <MdInsights className="h-5 w-5" aria-hidden />
              See {year} as a year
            </Link>
            <div className="flex items-center gap-1">
              {canClear && (
                <button type="button" onClick={clearMonth} className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-bad hover:bg-surface2 ${focus}`}>
                  <MdDeleteOutline className="h-5 w-5" aria-hidden />
                  Clear {monthLabel(ym).split(" ")[0]}
                </button>
              )}
              <Link href={`/s/${spaceId}/${now}`} onClick={close} className={`inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-ink2 hover:bg-surface2 ${focus}`}>
                This month
              </Link>
            </div>
          </div>
        </div>
      </dialog>
    </>
  );
}
