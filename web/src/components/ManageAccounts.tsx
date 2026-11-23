"use client";

import { useRef, useState, useTransition } from "react";
import { MdAdd, MdClose, MdDeleteOutline, MdSettings } from "react-icons/md";
import { bulkAction, saveAccountsAction } from "@/app/actions/data";
import { editableMoney } from "@/lib/budget/money";
import { btn, btnGhost, focus, input } from "./ui";

export interface ManagedAccount {
  id: number;
  name: string;
  kind: string;
  /** What it holds now, in cents. */
  balance: number;
  /** How many bills, one-offs and income entries in this month use it. */
  uses: number;
}

/**
 * Accounts belong to the whole book, so they are managed here and not in a month's sheet.
 * Edit any of the rows, use Add account for a new one, then Save once. A changed balance
 * is an admin override (no entry is added). Removing an account asks first and applies at once.
 */
export function ManageAccounts({ spaceId, ym, monthName, accounts }: { spaceId: number; ym: string; monthName: string; accounts: ManagedAccount[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [removing, setRemoving] = useState<number | null>(null);
  // Remounts the fields after a save, so the new row empties and the rows show what was saved.
  const [saved, setSaved] = useState(0);
  // Keys of the new account rows being added.
  const [fresh, setFresh] = useState<number[]>([]);
  const [pending, start] = useTransition();

  // Removing runs on its own, outside the form, so the dialog stays open and unsaved edits are kept.
  const remove = (id: number) => {
    const data = new FormData();
    data.set("spaceId", String(spaceId));
    data.set("ym", ym);
    data.set("rowKind", "bank");
    data.set("op", "delete");
    data.set("id", String(id));
    start(async () => {
      await bulkAction(data);
      setRemoving(null);
    });
  };

  return (
    <>
      <button type="button" onClick={() => dialog.current?.showModal()} className={`${btnGhost} gap-1`}>
        <MdSettings className="h-4 w-4" aria-hidden />
        Manage accounts
      </button>

      <dialog
        ref={dialog}
        aria-labelledby="accounts-title"
        onClick={(e) => e.target === dialog.current && dialog.current?.close()}
        onClose={() => setRemoving(null)}
        className="glass isolate m-auto w-[min(40rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-0 text-ink shadow-card backdrop:bg-black/50"
      >
        <form
          key={saved}
          action={saveAccountsAction}
          onSubmit={() => {
            dialog.current?.close();
            setSaved((n) => n + 1);
            setFresh([]);
          }}
        >
          <input type="hidden" name="spaceId" value={spaceId} />
          <input type="hidden" name="ym" value={ym} />
          <input type="hidden" name="rowKind" value="bank" />

          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <h2 id="accounts-title" className="text-lg font-semibold tracking-tight">
                Manage accounts
              </h2>
              <p className="mt-0.5 text-sm text-muted">
                Accounts are shared by every month, from {monthName} on. Balances also move when you mark income Received or bills Paid. Changing a balance here is an admin override: it
                sets the balance as typed, with no income or bill entry, and later months carry on from it. Type the figure your bank shows: bills marked Payment Made are still in it, and the cushion takes them off.
              </p>
            </div>
            <button type="button" onClick={() => dialog.current?.close()} aria-label="Close" className={`rounded-md p-1 text-muted hover:text-ink ${focus}`}>
              <MdClose className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-2 px-5 py-4">
            {accounts.map((a) => (
              <div key={a.id} className="rounded-xl border border-line px-3 py-2">
                <div className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="rowId" value={a.id} />
                  <label className="min-w-[8rem] flex-1 text-sm">
                    <span className="text-muted">Name</span>
                    <input name="name" defaultValue={a.name} required maxLength={80} className={`${input} mt-0.5`} />
                  </label>
                  <label className="w-32 text-sm">
                    <span className="text-muted">Type</span>
                    <input name="kind" defaultValue={a.kind} placeholder="Checking" maxLength={40} className={`${input} mt-0.5`} />
                  </label>
                  <label className="w-32 text-sm">
                    <span className="text-muted">Balance</span>
                    {/* What the dialog showed. The server only overrides when the typed figure differs from this, and the field is re-keyed when the balance changes (a deleted paycheck, a new Paid bill) so it never shows a stale figure. */}
                    <input type="hidden" name="balanceShown" value={editableMoney(a.balance)} />
                    <input key={a.balance} name="balance" defaultValue={editableMoney(a.balance)} inputMode="decimal" className={`${input} mt-0.5 text-right tabular-nums`} />
                  </label>
                  <button type="button" onClick={() => setRemoving(removing === a.id ? null : a.id)} aria-label={`Remove ${a.name}`} className={`grid h-9 w-9 place-items-center rounded-lg text-bad hover:bg-surface2 ${focus}`}>
                    <MdDeleteOutline className="h-5 w-5" aria-hidden />
                  </button>
                </div>
                {removing === a.id && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-line pt-2 text-sm">
                    <p className="min-w-[12rem] flex-1">
                      Remove <strong>{a.name}</strong> from {monthName} and every later month?{" "}
                      {a.uses > 0 ? `${a.uses} entr${a.uses === 1 ? "y" : "ies"} here keep their amounts but lose their account.` : "Nothing here uses it."} This cannot be undone. Other edits here stay until you save.
                    </p>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => remove(a.id)}
                      className={`inline-flex items-center rounded-lg bg-bad px-3 py-2 font-semibold text-page transition hover:brightness-105 disabled:opacity-60 ${focus}`}
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            ))}
            {accounts.length === 0 && fresh.length === 0 && <p className="text-sm text-muted">No accounts yet. Add one below.</p>}

            {fresh.map((key) => (
              <div key={key} className="rounded-xl border border-dashed border-line px-3 py-2">
                <div className="flex flex-wrap items-end gap-2">
                  <label className="min-w-[8rem] flex-1 text-sm">
                    <span className="text-muted">New account</span>
                    <input name="newName" placeholder="Name, e.g. Savings" required maxLength={80} autoFocus className={`${input} mt-0.5`} />
                  </label>
                  <label className="w-32 text-sm">
                    <span className="text-muted">Type</span>
                    <input name="newKind" placeholder="Checking" maxLength={40} className={`${input} mt-0.5`} />
                  </label>
                  <label className="w-32 text-sm">
                    <span className="text-muted">Balance today</span>
                    <input name="newBalance" placeholder="0.00" inputMode="decimal" className={`${input} mt-0.5 text-right tabular-nums`} />
                  </label>
                  <button type="button" onClick={() => setFresh(fresh.filter((k) => k !== key))} aria-label="Cancel this new account" className={`grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-surface2 hover:text-ink ${focus}`}>
                    <MdClose className="h-5 w-5" aria-hidden />
                  </button>
                </div>
              </div>
            ))}

            <button type="button" onClick={() => setFresh([...fresh, Date.now()])} className={`${btnGhost} gap-1`}>
              <MdAdd className="h-4 w-4" aria-hidden />
              Add account
            </button>
          </div>

          <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
            <button type="button" onClick={() => dialog.current?.close()} className={btnGhost}>
              Cancel
            </button>
            <button type="submit" className={btn}>
              Save changes
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
