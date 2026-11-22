"use client";

import { useRef } from "react";
import { MdArrowDownward, MdArrowUpward, MdClose, MdSwapVert } from "react-icons/md";
import { moveSpaceAction } from "@/app/actions/data";
import { btnGhost, focus } from "./ui";

/** A button and a dialog to put books in order. The order is the priority: it sets the tabs, the cards and which suggestions come first. */
export function ReorderBooks({ books }: { books: { id: number; name: string }[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const arrow = `grid h-8 w-8 place-items-center rounded-lg border border-line text-ink2 transition hover:bg-surface2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent ${focus}`;
  return (
    <>
      <button type="button" onClick={() => dialog.current?.showModal()} className={`${btnGhost} inline-flex items-center gap-1.5`}>
        <MdSwapVert className="h-4 w-4" aria-hidden />
        Reorder
      </button>

      <dialog
        ref={dialog}
        aria-labelledby="reorder-title"
        onClick={(e) => e.target === dialog.current && dialog.current?.close()}
        className="glass isolate m-auto w-[min(26rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-0 text-ink shadow-card backdrop:bg-black/50"
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 id="reorder-title" className="text-lg font-semibold tracking-tight">
              Order your books
            </h2>
            <p className="mt-0.5 text-sm text-muted">Top is most important. The order sets the tabs, the cards, and which items “Worth a look” shows first.</p>
          </div>
          <button type="button" onClick={() => dialog.current?.close()} aria-label="Close" className={`rounded-md p-1 text-muted hover:text-ink ${focus}`}>
            <MdClose className="h-5 w-5" />
          </button>
        </div>
        <ol className="divide-y divide-line px-5 py-1">
          {books.map((b, i) => (
            <li key={b.id} className="flex items-center gap-3 py-2.5">
              <span className="w-5 text-sm tabular-nums text-muted">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{b.name}</span>
              {(["up", "down"] as const).map((dir) => (
                <form key={dir} action={moveSpaceAction}>
                  <input type="hidden" name="spaceId" value={b.id} />
                  <input type="hidden" name="dir" value={dir} />
                  <button type="submit" disabled={dir === "up" ? i === 0 : i === books.length - 1} aria-label={`Move ${b.name} ${dir}`} className={arrow}>
                    {dir === "up" ? <MdArrowUpward className="h-4 w-4" aria-hidden /> : <MdArrowDownward className="h-4 w-4" aria-hidden />}
                  </button>
                </form>
              ))}
            </li>
          ))}
        </ol>
        <div className="flex justify-end border-t border-line px-5 py-3">
          <button type="button" onClick={() => dialog.current?.close()} className={btnGhost}>
            Done
          </button>
        </div>
      </dialog>
    </>
  );
}
