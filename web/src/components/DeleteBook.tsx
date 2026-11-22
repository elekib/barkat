"use client";

import { useRef, useState } from "react";
import { MdClose, MdDeleteOutline, MdWarningAmber } from "react-icons/md";
import { deleteSpaceAction } from "@/app/actions/data";
import { btnGhost, focus, input } from "./ui";

export interface BookContents {
  months: number;
  accounts: number;
  bills: number;
  oneOffs: number;
  income: number;
  schedules: number;
}

const n = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** A trash button and a confirmation dialog. Deleting needs the book's name typed back. */
export function DeleteBook({ id, name, contents }: { id: number; name: string; contents: BookContents }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState("");
  const match = typed.trim() === name;
  const close = () => {
    dialog.current?.close();
    setTyped("");
  };
  const lines = [
    n(contents.months, "month"),
    n(contents.accounts, "account"),
    n(contents.bills, "bill"),
    n(contents.oneOffs, "one-off payment"),
    n(contents.income, "income entry", "income entries"),
    n(contents.schedules, "income schedule"),
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        aria-label={`Delete ${name}`}
        title={`Delete ${name}`}
        className={`grid h-8 w-8 place-items-center rounded-lg text-muted transition hover:bg-surface2 hover:text-bad ${focus}`}
      >
        <MdDeleteOutline className="h-5 w-5" aria-hidden />
      </button>

      <dialog
        ref={dialog}
        aria-labelledby={`delete-${id}-title`}
        onClick={(e) => e.target === dialog.current && close()}
        onClose={() => setTyped("")}
        className="glass isolate m-auto w-[min(30rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-0 text-ink shadow-card backdrop:bg-black/50"
      >
        <form action={deleteSpaceAction} onSubmit={() => dialog.current?.close()}>
          <input type="hidden" name="spaceId" value={id} />
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--bad)_16%,transparent)] text-bad">
                <MdWarningAmber className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <h2 id={`delete-${id}-title`} className="text-lg font-semibold tracking-tight">
                  Delete “{name}”?
                </h2>
                <p className="mt-0.5 text-sm text-muted">This cannot be undone.</p>
              </div>
            </div>
            <button type="button" onClick={close} aria-label="Close" className={`rounded-md p-1 text-muted hover:text-ink ${focus}`}>
              <MdClose className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-3 px-5 py-4 text-sm">
            <p>Deleting this book permanently removes everything in it, from every month:</p>
            <ul className="grid list-disc gap-x-6 gap-y-0.5 pl-5 text-ink2 sm:grid-cols-2">
              {lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            <p className="text-muted">
              Nothing is archived and there is no trash. Other books are not touched. If you might need these numbers later, export them first from the book&apos;s Import / export page.
            </p>
            <label className="block">
              <span className="text-muted">
                Type <strong className="font-semibold text-ink">{name}</strong> to confirm
              </span>
              <input name="confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} className={`${input} mt-1`} />
            </label>
          </div>

          <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
            <button type="button" onClick={close} className={btnGhost}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={!match}
              className={`inline-flex items-center justify-center rounded-lg bg-bad px-4 py-2 font-semibold text-page transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40 ${focus}`}
            >
              Delete book
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
