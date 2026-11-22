"use client";

import Link from "next/link";
import { useRef } from "react";
import { MdCalendarMonth, MdClose, MdExpandMore } from "react-icons/md";
import { focus } from "./ui";

/**
 * The year in the pinned header, in the same place and shape as the month picker: a button that opens a grid
 * of years, each saying how many months it has, with this year marked. Arrow keys move, Home and End jump,
 * Escape closes.
 */
export function YearPicker({ spaceId, year, thisYear, years }: { spaceId: number; year: number; thisYear: number; years: { year: number; months: number }[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const grid = useRef<HTMLUListElement>(null);

  const open = () => {
    dialog.current?.showModal();
    requestAnimationFrame(() => (grid.current?.querySelector<HTMLElement>("[aria-current='page']") ?? grid.current?.querySelector<HTMLElement>("a"))?.focus());
  };
  const close = () => dialog.current?.close();

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
    }
  };

  return (
    <>
      <h1 className="shrink-0 whitespace-nowrap text-2xl font-bold tracking-tight">
        <button
          type="button"
          onClick={open}
          aria-haspopup="dialog"
          aria-label={`${year}. Choose another year`}
          className={`group -mx-1.5 flex max-w-full items-center gap-1 rounded-lg px-1.5 text-left hover:bg-surface2 ${focus}`}
        >
          <span>{year}</span>
          <MdExpandMore className="h-6 w-6 shrink-0 text-muted group-hover:text-ink" aria-hidden />
        </button>
      </h1>

      <dialog
        ref={dialog}
        aria-labelledby="year-picker-title"
        onClick={(e) => e.target === dialog.current && close()}
        className="glass isolate m-auto w-[min(25rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-0 text-ink shadow-card backdrop:bg-black/50"
      >
        <div onKeyDown={onKeys} className="flex max-h-[90vh] flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <h2 id="year-picker-title" className="flex items-center gap-2 text-base font-semibold tracking-tight">
              <MdCalendarMonth className="h-5 w-5 text-muted" aria-hidden />
              Go to a year
            </h2>
            <button type="button" onClick={close} aria-label="Close" className={`rounded-md p-1 text-muted hover:text-ink ${focus}`}>
              <MdClose className="h-5 w-5" />
            </button>
          </div>

          <ul ref={grid} aria-label="Years" className="grid grid-cols-3 gap-2 overflow-y-auto px-4 py-3">
            {years.map((y) => (
              <li key={y.year}>
                <Link
                  href={`/s/${spaceId}/year/${y.year}`}
                  onClick={close}
                  aria-current={y.year === year ? "page" : undefined}
                  aria-label={`${y.year}: ${y.months > 0 ? `${y.months} month${y.months === 1 ? "" : "s"}` : "no months"}${y.year === thisYear ? ", this year" : ""}${y.year === year ? ", showing now" : ""}`}
                  className={`flex min-h-[4.25rem] flex-col justify-center rounded-xl border px-2.5 py-1.5 transition hover:border-accent ${
                    y.months > 0 ? "border-line bg-surface2 text-ink" : "border-line bg-surface text-muted"
                  } ${y.year === year ? "ring-2 ring-accent" : ""} ${focus}`}
                >
                  <span className="flex items-center justify-between gap-1 text-sm font-semibold">
                    {y.year}
                    {y.year === thisYear && <span className="rounded-full bg-accent px-1.5 py-px text-[0.625rem] font-bold uppercase tracking-wide text-accent-ink">Now</span>}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1 text-[0.75rem]">
                    <span aria-hidden className={`inline-block h-2 w-2 shrink-0 rounded-full ${y.months > 0 ? "bg-accent" : "border border-dashed border-muted"}`} />
                    {y.months > 0 ? `${y.months} month${y.months === 1 ? "" : "s"}` : "No months"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <div className="flex justify-end border-t border-line px-4 py-3">
            <Link href={`/s/${spaceId}/year/${thisYear}`} onClick={close} className={`inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-ink2 hover:bg-surface2 ${focus}`}>
              This year
            </Link>
          </div>
        </div>
      </dialog>
    </>
  );
}
