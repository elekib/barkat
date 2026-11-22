"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MdContentCopy, MdClose } from "react-icons/md";
import { copyFromMonthAction } from "@/app/actions/data";
import { formatMoney } from "@/lib/budget/money";
import { monthLabel } from "@/lib/budget/months";
import { btn, btnGhost, focus, input } from "./ui";

export interface CopyMonth {
  ym: string;
  banks: { id: number; name: string; kind: string }[];
  bills: { id: number; name: string; projected: number; bankId: number | null }[];
}

const key = (n: string) => n.trim().toLowerCase();

/**
 * "Copy from month" in a dialog. Pick a month and how to copy it, see every line that would
 * come across (and, when replacing, what it removes), and untick any line you do not want.
 */
export function CopyFromMonth({
  spaceId,
  ym,
  sources,
  current,
  defaultFrom,
  exists = true,
}: {
  spaceId: number;
  ym: string;
  sources: CopyMonth[];
  current: { banks: string[]; bills: string[] };
  defaultFrom: string;
  /** False for a month that has not been started: it is created empty, then filled from the chosen lines. */
  exists?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [from, setFrom] = useState(defaultFrom);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [off, setOff] = useState<Set<string>>(new Set()); // lines the user unticked
  const replace = exists && mode === "replace";

  const source = sources.find((s) => s.ym === from) ?? sources[0];
  const haveBank = useMemo(() => new Set(current.banks.map(key)), [current.banks]);
  const haveBill = useMemo(() => new Set(current.bills.map(key)), [current.bills]);
  const bankName = (id: number | null) => source.banks.find((b) => b.id === id)?.name;

  // Lines already here are skipped when merging, and start ticked when replacing.
  const isNew = (kind: "bank" | "bill", name: string) => replace || !(kind === "bank" ? haveBank : haveBill).has(key(name));
  const on = (kind: "bank" | "bill", id: number, name: string) => isNew(kind, name) && !off.has(`${kind}${id}`);
  const toggle = (id: string) =>
    setOff((o) => {
      const n = new Set(o);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  useEffect(() => setOff(new Set()), [from, mode]);

  const bills = source.bills.filter((b) => on("bill", b.id, b.name));
  const banksNeeded = source.banks.filter(
    (b) => on("bank", b.id, b.name) || bills.some((x) => x.bankId === b.id && (replace || !haveBank.has(key(b.name)))),
  );
  const nothing = bills.length === 0 && banksNeeded.length === 0;

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm font-medium text-ink2 transition hover:bg-surface2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        <MdContentCopy className="h-5 w-5" aria-hidden />
        Copy from month
      </button>

      <dialog
        ref={dialog}
        aria-labelledby="copy-title"
        onClick={(e) => e.target === dialog.current && dialog.current?.close()}
        className="glass isolate m-auto w-[min(44rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-0 text-ink shadow-card backdrop:bg-black/50"
      >
        <form
          action={copyFromMonthAction}
          onSubmit={(e) => {
            if (replace && !window.confirm(`Replace the bills and accounts in ${monthLabel(ym)}? The current ones are deleted. One-offs and income stay.`)) {
              e.preventDefault();
              return;
            }
            dialog.current?.close();
          }}
          className="flex max-h-[85vh] flex-col"
        >
          <input type="hidden" name="spaceId" value={spaceId} />
          <input type="hidden" name="ym" value={ym} />
          {banksNeeded.map((b) => (
            <input key={`b${b.id}`} type="hidden" name="bankId" value={b.id} />
          ))}
          {bills.map((b) => (
            <input key={`l${b.id}`} type="hidden" name="billId" value={b.id} />
          ))}

          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <h2 id="copy-title" className="text-lg font-semibold tracking-tight">
                Copy into {monthLabel(ym)}
              </h2>
              <p className="mt-0.5 text-sm text-muted">{exists ? "Choose a month, see what would change, and untick any line you do not want." : `${monthLabel(ym)} has not been started. Pick the lines to start it with.`}</p>
            </div>
            <button type="button" onClick={() => dialog.current?.close()} aria-label="Close" className={`rounded-md p-1 text-muted hover:text-ink ${focus}`}>
              <MdClose className="h-5 w-5" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted">From</span>
              <select name="from" value={from} onChange={(e) => setFrom(e.target.value)} className={`${input} select-arrow w-auto bg-surface py-1.5 text-sm`}>
                {sources.map((m) => (
                  <option key={m.ym} value={m.ym}>
                    {monthLabel(m.ym)}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="flex gap-4 text-sm">
              <legend className="sr-only">How to copy</legend>
              <label className="flex items-center gap-1.5">
                <input type="radio" name="mode" value="merge" checked={!replace} onChange={() => setMode("merge")} className="accent-[var(--accent)]" />
                Add what is missing
              </label>
              {exists && <label className="flex items-center gap-1.5">
                <input type="radio" name="mode" value="replace" checked={replace} onChange={() => setMode("replace")} className="accent-[var(--accent)]" />
                Replace bills and accounts
              </label>}
            </fieldset>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
            {replace && (
              <p className="mb-3 rounded-lg border border-bad px-3 py-2 text-sm text-bad">
                Removes {current.bills.length} bill{current.bills.length === 1 ? "" : "s"} and {current.banks.length} account
                {current.banks.length === 1 ? "" : "s"} now in {monthLabel(ym)}, then adds the lines below. One-offs and income stay.
              </p>
            )}

            <h3 className="mb-1 text-[0.6875rem] font-semibold uppercase tracking-wider text-muted">Accounts</h3>
            {source.banks.length === 0 && <p className="mb-3 text-sm text-muted">None in {monthLabel(from)}.</p>}
            <ul className="mb-4 divide-y divide-line">
              {source.banks.map((b) => {
                const here = !replace && haveBank.has(key(b.name));
                const viaBill = bills.some((x) => x.bankId === b.id) && !here;
                const checked = on("bank", b.id, b.name) || viaBill;
                return (
                  <Line key={b.id} checked={checked} disabled={here || viaBill} onChange={() => toggle(`bank${b.id}`)} label={b.name || "Untitled account"} note={here ? "Already here" : viaBill ? "Needed by a bill below" : b.kind} muted={here} />
                );
              })}
            </ul>

            <h3 className="mb-1 text-[0.6875rem] font-semibold uppercase tracking-wider text-muted">Bills</h3>
            {source.bills.length === 0 && <p className="text-sm text-muted">None in {monthLabel(from)}.</p>}
            <ul className="divide-y divide-line">
              {source.bills.map((b) => {
                const here = !replace && haveBill.has(key(b.name));
                return (
                  <Line
                    key={b.id}
                    checked={on("bill", b.id, b.name)}
                    disabled={here}
                    onChange={() => toggle(`bill${b.id}`)}
                    label={b.name || "Untitled"}
                    note={here ? "Already here" : [bankName(b.bankId), formatMoney(b.projected)].filter(Boolean).join(" · ")}
                    muted={here}
                  />
                );
              })}
            </ul>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
            <span className="text-sm text-muted" aria-live="polite">
              {nothing ? "Nothing to copy" : `Adds ${bills.length} bill${bills.length === 1 ? "" : "s"} and ${banksNeeded.length} account${banksNeeded.length === 1 ? "" : "s"}`}
            </span>
            <div className="flex gap-2">
              <button type="button" onClick={() => dialog.current?.close()} className={btnGhost}>
                Cancel
              </button>
              <button type="submit" className={btn} disabled={nothing && !replace}>
                {replace ? "Replace and copy" : "Copy"}
              </button>
            </div>
          </div>
        </form>
      </dialog>
    </>
  );
}

function Line({ checked, disabled, onChange, label, note, muted }: { checked: boolean; disabled: boolean; onChange: () => void; label: string; note: string; muted: boolean }) {
  return (
    <li>
      <label className={`flex items-center gap-3 py-1.5 text-sm ${muted ? "text-muted" : ""}`}>
        <input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} className="h-5 w-5 accent-[var(--accent)]" />
        <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
        <span className="shrink-0 text-xs text-muted tabular-nums">{note}</span>
      </label>
    </li>
  );
}
