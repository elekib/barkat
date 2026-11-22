"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MdClose, MdDeleteOutline, MdWarningAmber } from "react-icons/md";
import { bulkAction } from "@/app/actions/data";
import { btnGhost, focus } from "./ui";

/**
 * The toolbar for a table's selected rows. The rows' checkboxes live in the table and point at this
 * form with the `form` attribute, so the selected ids travel with it and no selection state is kept.
 * This component only counts the ticked boxes, runs "select all", and clears other tables' picks so
 * one toolbar is showing at a time.
 */
export function BulkBar({
  formId,
  rowKind,
  spaceId,
  ym,
  noun,
  statuses,
  accounts,
  deleteNote,
}: {
  formId: string;
  rowKind: "bank" | "bill" | "income" | "adhoc" | "schedule";
  spaceId: number;
  ym: string;
  /** Singular and plural, lower case: "bill", "bills". */
  noun: [string, string];
  statuses?: readonly string[];
  /** Options for "Set account": the value that is sent, and what it is called. */
  accounts?: { value: string; label: string }[];
  /** An extra consequence to mention when confirming a delete. */
  deleteNote?: string;
}) {
  const form = useRef<HTMLFormElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const op = useRef<HTMLInputElement>(null);
  const value = useRef<HTMLInputElement>(null);
  const [count, setCount] = useState(0);
  const [mounted, setMounted] = useState(false);

  const boxes = useCallback(() => [...document.querySelectorAll<HTMLInputElement>(`input[type="checkbox"][form="${formId}"]`)], [formId]);
  const all = useCallback(() => document.querySelector<HTMLInputElement>(`input[data-bulk-all="${formId}"]`), [formId]);

  const sync = useCallback(() => {
    const list = boxes();
    const ticked = list.filter((b) => b.checked).length;
    setCount(ticked);
    const head = all();
    if (head) {
      head.checked = list.length > 0 && ticked === list.length;
      head.indeterminate = ticked > 0 && ticked < list.length;
    }
  }, [boxes, all]);

  const clear = useCallback(() => {
    boxes().forEach((b) => (b.checked = false));
    sync();
  }, [boxes, sync]);

  useEffect(() => {
    setMounted(true);
    const onChange = (e: Event) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement) || t.type !== "checkbox") return;
      if (t.dataset.bulkAll === formId) {
        boxes().forEach((b) => (b.checked = t.checked));
        sync();
      } else if (t.getAttribute("form") === formId) {
        sync();
      } else if (t.checked && (t.getAttribute("form")?.startsWith("bulk-") || t.dataset.bulkAll)) {
        // A pick in another table: this one steps aside.
        clear();
      }
    };
    document.addEventListener("change", onChange);
    sync();
    return () => document.removeEventListener("change", onChange);
  }, [formId, boxes, sync, clear]);

  // Rows can be re-rendered by a save; keep the count honest.
  useEffect(() => {
    const t = window.setInterval(sync, 700);
    return () => window.clearInterval(t);
  }, [sync]);

  const word = count === 1 ? noun[0] : noun[1];
  const submit = (kind: "status" | "account", v: string) => {
    if (!form.current || !op.current || !value.current) return;
    op.current.value = kind;
    value.current.value = v;
    form.current.requestSubmit();
  };
  const select = `select-arrow h-9 rounded-lg border border-line bg-surface px-2 text-sm text-ink ${focus}`;

  const bar = (
    <form
      ref={form}
      id={formId}
      action={bulkAction}
      onSubmit={() => {
        // The ids are read as the form is submitted; clear the ticks a moment later.
        window.setTimeout(clear, 400);
      }}
    >
      <input type="hidden" name="spaceId" value={spaceId} />
      <input type="hidden" name="ym" value={ym} />
      <input type="hidden" name="rowKind" value={rowKind} />
      <input ref={op} type="hidden" name="op" defaultValue="delete" />
      <input ref={value} type="hidden" name="value" defaultValue="" />

      {count > 0 && (
        <div
          role="region"
          aria-label={`Actions for selected ${noun[1]}`}
          className="glass isolate fixed inset-x-3 bottom-20 z-30 mx-auto flex max-w-fit flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface px-3 py-2 text-sm shadow-card md:bottom-6"
        >
          <span className="px-1 font-semibold" aria-live="polite">
            {count} {word} selected
          </span>
          {statuses && (
            <select aria-label={`Set status of selected ${noun[1]}`} className={select} value="" onChange={(e) => e.target.value && submit("status", e.target.value)}>
              <option value="">Set status…</option>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
          {accounts && (
            <select aria-label={`Set account of selected ${noun[1]}`} className={select} value="" onChange={(e) => e.target.value !== "" && submit("account", e.target.value === "__none" ? "" : e.target.value)}>
              <option value="">Set account…</option>
              <option value="__none">No account</option>
              {accounts.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => dialog.current?.showModal()}
            className={`inline-flex h-9 items-center gap-1 rounded-lg border border-line bg-surface px-3 font-medium text-bad transition hover:border-bad ${focus}`}
          >
            <MdDeleteOutline className="h-5 w-5" aria-hidden />
            Delete
          </button>
          <button type="button" onClick={clear} aria-label="Clear selection" className={`grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-surface2 hover:text-ink ${focus}`}>
            <MdClose className="h-5 w-5" aria-hidden />
          </button>
        </div>
      )}

      <dialog
        ref={dialog}
        aria-labelledby={`${formId}-delete`}
        onClick={(e) => e.target === dialog.current && dialog.current?.close()}
        className="glass isolate m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-0 text-ink shadow-card backdrop:bg-black/50"
      >
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--bad)_16%,transparent)] text-bad">
            <MdWarningAmber className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h2 id={`${formId}-delete`} className="text-lg font-semibold tracking-tight">
              Delete {count} {word}?
            </h2>
            <p className="mt-0.5 text-sm text-muted">This cannot be undone.</p>
          </div>
        </div>
        <div className="space-y-2 px-5 py-4 text-sm">
          <p>
            The {count === 1 ? "selected row is" : `${count} selected rows are`} removed from this month for good. Other months are not touched.
          </p>
          {deleteNote && <p className="text-muted">{deleteNote}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
          <button type="button" onClick={() => dialog.current?.close()} className={btnGhost}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (op.current) op.current.value = "delete";
              dialog.current?.close();
              form.current?.requestSubmit();
            }}
            className={`inline-flex items-center justify-center rounded-lg bg-bad px-4 py-2 font-semibold text-page transition hover:brightness-105 ${focus}`}
          >
            Delete {count} {word}
          </button>
        </div>
      </dialog>
    </form>
  );

  // Portal to the page so no card's own stacking can cover the toolbar.
  return mounted ? createPortal(bar, document.body) : null;
}
