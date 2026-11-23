"use client";

import { useRef, useState, useTransition } from "react";
import { MdAdd, MdClose, MdDeleteOutline, MdEventRepeat } from "react-icons/md";
import { bulkAction, saveSchedulesAction } from "@/app/actions/data";
import { editableMoney, formatMoney, parseMoney } from "@/lib/budget/money";
import { FREQUENCIES, FREQUENCY_LABEL, scheduleDates, type Frequency } from "@/lib/budget/schedules";
import { btn, btnGhost, focus, input } from "./ui";

export interface ManagedSchedule {
  id: number;
  label: string;
  /** Cents. */
  amount: number;
  frequency: Frequency;
  /** A real payday, as YYYY-MM-DD. */
  anchor: string;
  /** The account's name, or "" for none. */
  account: string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const short = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;

/** What a schedule gives in the viewed month, from the fields as they stand, before anything is saved. */
function Preview({ ym, frequency, anchor, amount }: { ym: string; frequency: Frequency; anchor: string; amount: string }) {
  const dates = /^\d{4}-\d{2}-\d{2}$/.test(anchor) ? scheduleDates(frequency, anchor, ym) : [];
  const cents = parseMoney(amount) ?? 0;
  return (
    <p className="mt-1.5 text-[0.8125rem] text-muted" aria-live="polite">
      {cents <= 0
        ? "Add an amount to start adding paychecks."
        : dates.length === 0
          ? "No payday this month."
          : `This month: ${dates.map(short).join(", ")} · ${formatMoney(cents * dates.length)}`}
    </p>
  );
}

function Fields({ prefix, ym, accounts, start }: { prefix: "" | "new"; ym: string; accounts: string[]; start: Partial<ManagedSchedule> }) {
  const [frequency, setFrequency] = useState<Frequency>(start.frequency ?? "biweekly");
  const [anchor, setAnchor] = useState(start.anchor ?? `${ym}-01`);
  const [amount, setAmount] = useState(start.amount ? editableMoney(start.amount) : "");
  const n = (name: string) => (prefix ? `new${name[0].toUpperCase()}${name.slice(1)}` : name);
  return (
    <>
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[8rem] flex-1 text-sm">
          <span className="text-muted">What</span>
          <input name={n("label")} defaultValue={start.label ?? ""} placeholder="Paycheck" maxLength={120} className={`${input} mt-0.5`} />
        </label>
        <label className="w-36 text-sm">
          <span className="text-muted">Repeats</span>
          <select name={n("frequency")} value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)} className={`${input} select-arrow mt-0.5`}>
            {FREQUENCIES.map((f) => (
              <option key={f} value={f}>
                {FREQUENCY_LABEL[f]}
              </option>
            ))}
          </select>
        </label>
        <label className="w-40 text-sm">
          <span className="text-muted">A payday</span>
          <input name={n("anchor")} type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} required className={`${input} mt-0.5`} />
        </label>
        <label className="w-28 text-sm">
          <span className="text-muted">Amount</span>
          <input
            name={n("amount")}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            inputMode="decimal"
            required={prefix === "new"}
            className={`${input} mt-0.5 text-right tabular-nums`}
          />
        </label>
        <label className="w-36 text-sm">
          <span className="text-muted">Into</span>
          <select name={n("account")} defaultValue={start.account ?? ""} className={`${input} select-arrow mt-0.5`}>
            <option value="">No account</option>
            {accounts.map((a) => (
              <option key={a} value={a}>
                {a || "Untitled account"}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Preview ym={ym} frequency={frequency} anchor={anchor} amount={amount} />
    </>
  );
}

/**
 * The repeating paychecks of a book, in one dialog on the Income card. Edit the rows, use Add schedule for a
 * new one, then Save once: the Income card is brought into step with them (paydays added, moved or taken
 * back). Each row says what it will give this month as you type. Removing asks first and applies at once.
 */
export function ManageSchedules({ spaceId, ym, monthName, schedules, accounts }: { spaceId: number; ym: string; monthName: string; schedules: ManagedSchedule[]; accounts: string[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [removing, setRemoving] = useState<number | null>(null);
  // Remounts the fields after a save, so the rows show what was saved and the new rows empty.
  const [saved, setSaved] = useState(0);
  const [fresh, setFresh] = useState<number[]>([]);
  const [pending, start] = useTransition();

  // Removing runs on its own, outside the form, so the dialog stays open and unsaved edits are kept.
  const remove = (id: number) => {
    const data = new FormData();
    data.set("spaceId", String(spaceId));
    data.set("ym", ym);
    data.set("rowKind", "schedule");
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
        <MdEventRepeat className="h-4 w-4" aria-hidden />
        Schedules{schedules.length > 0 ? ` (${schedules.length})` : ""}
      </button>

      <dialog
        ref={dialog}
        aria-labelledby="schedules-title"
        onClick={(e) => e.target === dialog.current && dialog.current?.close()}
        onClose={() => setRemoving(null)}
        className="glass isolate m-auto w-[min(46rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-0 text-ink shadow-card backdrop:bg-black/50"
      >
        <form
          key={saved}
          action={saveSchedulesAction}
          onSubmit={() => {
            dialog.current?.close();
            setSaved((n) => n + 1);
            setFresh([]);
          }}
        >
          <input type="hidden" name="spaceId" value={spaceId} />
          <input type="hidden" name="ym" value={ym} />

          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <h2 id="schedules-title" className="text-lg font-semibold tracking-tight">
                Schedules
              </h2>
              <p className="mt-0.5 text-sm text-muted">
                Paychecks that repeat. Saving adds, moves or takes back the Pending paychecks on the Income card from {monthName} on. Paychecks already marked Received stay as they are.
              </p>
            </div>
            <button type="button" onClick={() => dialog.current?.close()} aria-label="Close" className={`rounded-md p-1 text-muted hover:text-ink ${focus}`}>
              <MdClose className="h-5 w-5" aria-hidden />
            </button>
          </div>

          <div className="grid max-h-[65vh] gap-3 overflow-y-auto px-5 py-4">
            {schedules.map((s) => (
              <div key={s.id} className="rounded-xl border border-line px-3 py-2.5">
                <input type="hidden" name="rowId" value={s.id} />
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <Fields prefix="" ym={ym} accounts={accounts} start={s} />
                  </div>
                  <button type="button" onClick={() => setRemoving(removing === s.id ? null : s.id)} aria-label={`Remove ${s.label || "schedule"}`} className={`mt-5 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-bad hover:bg-surface2 ${focus}`}>
                    <MdDeleteOutline className="h-5 w-5" aria-hidden />
                  </button>
                </div>
                {removing === s.id && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-line pt-2 text-sm">
                    <p className="min-w-[12rem] flex-1">
                      Remove <strong>{s.label || "this schedule"}</strong>? Its Pending paychecks come off the Income card; Received ones stay. This cannot be undone. Other edits here stay until you save.
                    </p>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => remove(s.id)}
                      className={`inline-flex items-center rounded-lg bg-bad px-3 py-2 font-semibold text-page transition hover:brightness-105 disabled:opacity-60 ${focus}`}
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            ))}
            {schedules.length === 0 && fresh.length === 0 && <p className="text-sm text-muted">No schedules yet. Add one for a paycheck that repeats weekly, every two weeks or monthly.</p>}

            {fresh.map((key) => (
              <div key={key} className="rounded-xl border border-dashed border-line px-3 py-2.5">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <Fields prefix="new" ym={ym} accounts={accounts} start={{}} />
                  </div>
                  <button type="button" onClick={() => setFresh(fresh.filter((k) => k !== key))} aria-label="Cancel this new schedule" className={`mt-5 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface2 hover:text-ink ${focus}`}>
                    <MdClose className="h-5 w-5" aria-hidden />
                  </button>
                </div>
              </div>
            ))}

            <div>
              <button type="button" onClick={() => setFresh([...fresh, Date.now()])} className={`${btnGhost} gap-1`}>
                <MdAdd className="h-4 w-4" aria-hidden />
                Add schedule
              </button>
            </div>
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
