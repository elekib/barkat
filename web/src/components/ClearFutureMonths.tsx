"use client";

import { useRef } from "react";
import { MdClose, MdDeleteSweep, MdWarningAmber } from "react-icons/md";
import { clearFutureMonthsAction } from "@/app/actions/data";
import { monthLabel } from "@/lib/budget/months";
import { btnGhost, focus } from "./ui";

/** A button and a confirmation dialog that lists the months after the current one before deleting them. */
export function ClearFutureMonths({ spaceId, current, months }: { spaceId: number; current: string; months: { ym: string; items: number }[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = () => dialog.current?.close();
  const count = months.length;

  return (
    <>
      <button type="button" onClick={() => dialog.current?.showModal()} className={btnGhost}>
        <MdDeleteSweep className="mr-1.5 h-5 w-5" aria-hidden />
        Clear {count} future month{count === 1 ? "" : "s"}
      </button>

      <dialog
        ref={dialog}
        aria-labelledby="clear-future-title"
        onClick={(e) => e.target === dialog.current && close()}
        className="glass isolate m-auto w-[min(30rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-0 text-ink shadow-card backdrop:bg-black/50"
      >
        <form action={clearFutureMonthsAction} onSubmit={close}>
          <input type="hidden" name="spaceId" value={spaceId} />
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--bad)_16%,transparent)] text-bad">
                <MdWarningAmber className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <h2 id="clear-future-title" className="text-lg font-semibold tracking-tight">
                  Clear months after {monthLabel(current)}?
                </h2>
                <p className="mt-0.5 text-sm text-muted">This cannot be undone.</p>
              </div>
            </div>
            <button type="button" onClick={close} aria-label="Close" className={`rounded-md p-1 text-muted hover:text-ink ${focus}`}>
              <MdClose className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-3 px-5 py-4 text-sm">
            <p>These months are deleted with everything in them:</p>
            <ul className="max-h-48 divide-y divide-line overflow-y-auto rounded-lg border border-line">
              {[...months].reverse().map((m) => (
                <li key={m.ym} className="flex justify-between gap-3 px-3 py-1.5">
                  <span className="font-medium">{monthLabel(m.ym)}</span>
                  <span className="text-muted">{m.items === 0 ? "empty" : `${m.items} line${m.items === 1 ? "" : "s"}`}</span>
                </li>
              ))}
            </ul>
            <p className="text-muted">
              {monthLabel(current)} and earlier months are not touched, and neither are your income schedules. A cleared month can be started again later.
            </p>
          </div>

          <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
            <button type="button" onClick={close} className={btnGhost}>
              Cancel
            </button>
            <button type="submit" className={`inline-flex items-center justify-center rounded-lg bg-bad px-4 py-2 font-semibold text-page transition hover:brightness-105 ${focus}`}>
              Delete {count} month{count === 1 ? "" : "s"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
