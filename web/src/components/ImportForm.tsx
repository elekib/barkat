"use client";

import { useActionState } from "react";
import { importAction, type ImportState } from "@/app/actions/data";
import { btn, input } from "./ui";

/** Upload an .xlsx and report what happened to each sheet. */
export function ImportForm({ spaceId, defaultYear }: { spaceId: number; defaultYear: number }) {
  const [state, action, pending] = useActionState<ImportState, FormData>(importAction, {});

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="spaceId" value={spaceId} />
      <div>
        <label htmlFor="file" className="mb-1 block text-sm font-medium">
          Excel file (.xlsx)
        </label>
        <input id="file" name="file" type="file" accept=".xlsx" required className={`${input} file:mr-3 file:rounded-md file:border-0 file:bg-surface2 file:px-3 file:py-1 file:text-sm file:text-ink`} />
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="year" className="mb-1 block text-sm font-medium">
            Year for sheets without one
          </label>
          <input id="year" name="year" type="number" min={1990} max={2200} defaultValue={defaultYear} className={`${input} w-32`} />
        </div>
        <label className="flex items-center gap-2 py-1 text-sm">
          <input type="checkbox" name="replace" className="h-5 w-5 accent-[var(--accent)]" />
          Replace months that already exist
        </label>
        <label className="flex items-center gap-2 py-1 text-sm">
          <input type="checkbox" name="firstAccount" defaultChecked className="h-5 w-5 accent-[var(--accent)]" />
          Give payments and income with no account to the first account
        </label>
      </div>
      <button type="submit" className={btn} disabled={pending}>
        {pending ? "Importing…" : "Import"}
      </button>

      {state.error && (
        <p role="alert" className="text-sm font-medium text-bad">
          {state.error}
        </p>
      )}
      {state.results && (
        <ul className="divide-y divide-line rounded-lg border border-line text-sm" aria-live="polite">
          {state.results.length === 0 && <li className="px-3 py-2 text-muted">Nothing found in that file.</li>}
          {state.results.map((r, i) => (
            <li key={i} className="flex flex-wrap gap-x-3 px-3 py-2">
              <span className="font-medium">{r.sheet}</span>
              {r.ym && <span className="text-muted">{r.ym}</span>}
              <span className={r.outcome.startsWith("Skipped") ? "text-muted" : "text-good"}>{r.outcome}</span>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
