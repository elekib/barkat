"use client";

import { useRef } from "react";
import { MdAdd, MdClose } from "react-icons/md";
import { createSpaceAction } from "@/app/actions/data";
import { btn, btnGhost, focus, input } from "./ui";

/** "Create book" button with the name form in a dialog. */
export function CreateSpace() {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" onClick={() => dialog.current?.showModal()} className={`${btn} inline-flex shrink-0 items-center gap-1.5`}>
        <MdAdd className="h-5 w-5" aria-hidden />
        Create book
      </button>

      <dialog
        ref={dialog}
        aria-labelledby="book-title"
        onClick={(e) => e.target === dialog.current && dialog.current?.close()}
        className="glass isolate m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-0 text-ink shadow-card backdrop:bg-black/50"
      >
        <form action={createSpaceAction} onSubmit={() => dialog.current?.close()}>
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <h2 id="book-title" className="text-lg font-semibold tracking-tight">
                Create a book
              </h2>
              <p className="mt-0.5 text-sm text-muted">Each book keeps its own accounts: the household, a parent&apos;s, or your own.</p>
            </div>
            <button type="button" onClick={() => dialog.current?.close()} aria-label="Close" className={`rounded-md p-1 text-muted hover:text-ink ${focus}`}>
              <MdClose className="h-5 w-5" />
            </button>
          </div>
          <div className="px-5 py-4">
            <label className="block text-sm">
              <span className="text-muted">Name</span>
              <input name="name" placeholder="e.g. Household" required maxLength={80} autoFocus className={`${input} mt-1`} />
            </label>
          </div>
          <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
            <button type="button" onClick={() => dialog.current?.close()} className={btnGhost}>
              Cancel
            </button>
            <button type="submit" className={btn}>
              Create book
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
