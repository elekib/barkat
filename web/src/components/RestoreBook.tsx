"use client";

import { useActionState } from "react";
import { restoreBookAction } from "@/app/actions/data";
import { btnGhost, input } from "./ui";

/** Pick a Barkat backup file and recreate its book as a new one. */
export function RestoreBook() {
  const [state, action, pending] = useActionState(restoreBookAction, {});
  return (
    <form action={action} className="space-y-2">
      <label className="block text-sm">
        <span className="text-muted">Backup file (.json)</span>
        <input name="file" type="file" accept=".json,application/json" required className={`${input} mt-1 file:mr-3 file:rounded-md file:border-0 file:bg-surface2 file:px-3 file:py-1 file:text-sm file:text-ink`} />
      </label>
      <button type="submit" className={btnGhost} disabled={pending}>
        {pending ? "Restoring…" : "Restore as a new book"}
      </button>
      {state.error && (
        <p role="alert" className="text-sm font-medium text-bad">
          {state.error}
        </p>
      )}
    </form>
  );
}
