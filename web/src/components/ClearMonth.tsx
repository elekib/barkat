"use client";

import { useRef } from "react";
import { MdClose, MdWarningAmber } from "react-icons/md";
import { clearMonthAction } from "@/app/actions/data";
import { monthLabel } from "@/lib/budget/months";
import { btnGhost, focus } from "./ui";

/** Id of the dialog, so the month picker can open it. */
export const CLEAR_MONTH_DIALOG = "clear-month-dialog";

/** The confirmation dialog that deletes one future month. It has no button of its own: the month picker opens it. */
export function ClearMonth({ spaceId, ym }: { spaceId: number; ym: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = () => dialog.current?.close();

  return (
    <>
      <dialog
        ref={dialog}
        id={CLEAR_MONTH_DIALOG}
        aria-labelledby="clear-month-title"
        onClick={(e) => e.target === dialog.current && close()}
        className="glass isolate m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-0 text-ink shadow-card backdrop:bg-black/50"
      >
        <form action={clearMonthAction} onSubmit={close}>
          <input type="hidden" name="spaceId" value={spaceId} />
          <input type="hidden" name="ym" value={ym} />
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--bad)_16%,transparent)] text-bad">
                <MdWarningAmber className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <h2 id="clear-month-title" className="text-lg font-semibold tracking-tight">
                  Clear {monthLabel(ym)}?
                </h2>
                <p className="mt-0.5 text-sm text-muted">This cannot be undone.</p>
              </div>
            </div>
            <button type="button" onClick={close} aria-label="Close" className={`rounded-md p-1 text-muted hover:text-ink ${focus}`}>
              <MdClose className="h-5 w-5" />
            </button>
          </div>
          <div className="px-5 py-4 text-sm text-ink2">
            <p>
              This deletes {monthLabel(ym)} with its accounts, bills, one-offs and income. Other months and your income schedules are not touched, and you can start the month again later.
            </p>
          </div>
          <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
            <button type="button" onClick={close} className={btnGhost}>
              Cancel
            </button>
            <button type="submit" className={`inline-flex items-center justify-center rounded-lg bg-bad px-4 py-2 font-semibold text-page transition hover:brightness-105 ${focus}`}>
              Delete {monthLabel(ym)}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
