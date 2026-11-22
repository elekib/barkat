"use client";

import { useRef, useState, useTransition } from "react";
import { MdClose, MdDescription, MdInventory2 } from "react-icons/md";
import { importAction, type ImportPreview, type ImportState } from "@/app/actions/data";
import { formatMoney } from "@/lib/budget/money";
import { monthLabel } from "@/lib/budget/months";
import { fileKind, yearFromName } from "@/lib/excel/months";
import { btn, btnGhost, focus, input } from "./ui";

interface Chosen {
  key: string;
  file: File;
  /** The year for sheets whose names have none. Blank for a backup (its months carry their years). */
  year: string;
}

const ACTION_LABEL = { add: "Add", replace: "Replace", skip: "Skip" } as const;

/**
 * Import one or more files: Excel workbooks (give each its year) and Barkat backups. "Preview" works out
 * what would happen to every month, writing nothing; "Import" then does exactly that. Changing a file or an
 * option clears the preview, so what you confirm is what you saw.
 */
export function ImportForm({ spaceId, defaultYear }: { spaceId: number; defaultYear: number }) {
  const [files, setFiles] = useState<Chosen[]>([]);
  const [replace, setReplace] = useState(false);
  const [firstAccount, setFirstAccount] = useState(true);
  const [state, setState] = useState<ImportState>({});
  const [pending, start] = useTransition();
  const picker = useRef<HTMLInputElement>(null);

  const forget = () => setState({});
  const add = (list: FileList | null) => {
    if (!list) return;
    const next = [...list].map((file) => ({
      key: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
      file,
      // A year in the name wins; otherwise ask, rather than guess the wrong decade.
      year: fileKind(file.name) === "backup" ? "" : String(yearFromName(file.name) ?? ""),
    }));
    setFiles((f) => [...f, ...next]);
    forget();
    if (picker.current) picker.current.value = "";
  };

  const run = (intent: "preview" | "import") => {
    const fd = new FormData();
    fd.set("spaceId", String(spaceId));
    fd.set("intent", intent);
    if (replace) fd.set("replace", "on");
    if (firstAccount) fd.set("firstAccount", "on");
    for (const f of files) {
      fd.append("file", f.file);
      fd.append("year", f.year);
    }
    start(async () => setState(await importAction(fd)));
  };

  const p = state.preview;
  const needYear = files.some((f) => fileKind(f.file.name) === "xlsx" && f.year.trim() === "");

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="import-files" className="mb-1 block text-sm font-medium">
          Files: Excel workbooks (.xlsx) or Barkat backups (.json)
        </label>
        <input
          ref={picker}
          id="import-files"
          type="file"
          accept=".xlsx,.json"
          multiple
          onChange={(e) => add(e.target.files)}
          className={`${input} file:mr-3 file:rounded-md file:border-0 file:bg-surface2 file:px-3 file:py-1 file:text-sm file:text-ink`}
        />
        <p className="mt-1 text-[0.8125rem] text-muted">
          Choose several at once, or add more later. For many years, use one workbook per year and give each its year: it is used for sheets named only &quot;March&quot;.
        </p>
      </div>

      {files.length > 0 && (
        <ul className="divide-y divide-line rounded-lg border border-line text-sm" aria-label="Files to import">
          {files.map((f) => {
            const kind = fileKind(f.file.name);
            return (
              <li key={f.key} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2">
                {kind === "backup" ? <MdInventory2 className="h-5 w-5 shrink-0 text-muted" aria-hidden /> : <MdDescription className="h-5 w-5 shrink-0 text-muted" aria-hidden />}
                <span className="min-w-0 flex-1 basis-40 truncate font-medium" title={f.file.name}>
                  {f.file.name}
                </span>
                {kind === "backup" ? (
                  <span className="text-[0.8125rem] text-muted">Backup: months keep their own years</span>
                ) : (
                  <label className="flex items-center gap-2">
                    <span className="text-[0.8125rem] text-muted">Year</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1900}
                      max={2200}
                      value={f.year}
                      placeholder={String(defaultYear)}
                      aria-label={`Year for ${f.file.name}`}
                      onChange={(e) => {
                        setFiles((all) => all.map((x) => (x.key === f.key ? { ...x, year: e.target.value } : x)));
                        forget();
                      }}
                      className={`${input} w-24 py-1 text-sm`}
                    />
                  </label>
                )}
                <button
                  type="button"
                  aria-label={`Remove ${f.file.name}`}
                  onClick={() => {
                    setFiles((all) => all.filter((x) => x.key !== f.key));
                    forget();
                  }}
                  className={`rounded-md p-1 text-muted hover:text-ink ${focus}`}
                >
                  <MdClose className="h-5 w-5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <label className="flex items-center gap-2 py-1 text-sm">
          <input type="checkbox" checked={replace} onChange={(e) => { setReplace(e.target.checked); forget(); }} className="h-5 w-5 accent-[var(--accent)]" />
          Replace months that already exist
        </label>
        <label className="flex items-center gap-2 py-1 text-sm">
          <input type="checkbox" checked={firstAccount} onChange={(e) => { setFirstAccount(e.target.checked); forget(); }} className="h-5 w-5 accent-[var(--accent)]" />
          Give payments and income with no account to the first account
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={btnGhost} disabled={pending || files.length === 0} onClick={() => run("preview")}>
          {pending && !p ? "Working…" : "Preview"}
        </button>
        {p && !state.done && p.add + p.replace > 0 && (
          <button type="button" className={btn} disabled={pending} onClick={() => run("import")}>
            {pending ? "Importing…" : `Import ${p.add + p.replace} month${p.add + p.replace === 1 ? "" : "s"}`}
          </button>
        )}
        {needYear && <span className="text-[0.8125rem] text-muted">A workbook with no year only reads sheets that name theirs (&quot;March 2022&quot;).</span>}
      </div>

      {state.error && (
        <p role="alert" className="text-sm font-medium text-bad">
          {state.error}
        </p>
      )}
      {p && <PreviewTable preview={p} done={!!state.done} />}
    </div>
  );
}

function PreviewTable({ preview: p, done }: { preview: ImportPreview; done: boolean }) {
  const word = (a: "add" | "replace" | "skip") => (done ? { add: "Added", replace: "Replaced", skip: "Skipped" }[a] : ACTION_LABEL[a]);
  const total = p.add + p.replace;
  return (
    <section aria-live="polite" aria-label={done ? "Import result" : "Import preview"} className="space-y-3">
      <p className={`text-sm font-medium ${done ? "text-good" : ""}`}>
        {done ? "Imported" : "Would import"} {total} month{total === 1 ? "" : "s"}
        {p.replace > 0 && ` (${p.replace} replaced)`}
        {p.skip > 0 && `, ${p.skip} skipped`}
        {p.skipped.length > 0 && `, ${p.skipped.length} sheet${p.skipped.length === 1 ? "" : "s"} not months`}.
        {!done && total > 0 && " Nothing is written until you import."}
      </p>

      {p.rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[34rem] border-collapse text-left text-sm tabular-nums">
            <caption className="sr-only">Months found in the chosen files</caption>
            <thead>
              <tr className="border-b border-line text-[0.6875rem] font-semibold uppercase tracking-wider text-muted">
                <th scope="col" className="px-3 py-2">Month</th>
                <th scope="col" className="px-2 py-2 text-right">Bills</th>
                <th scope="col" className="px-2 py-2 text-right">One-offs</th>
                <th scope="col" className="px-2 py-2 text-right">Income</th>
                <th scope="col" className="px-2 py-2 text-right">Accounts</th>
                <th scope="col" className="px-3 py-2">What happens</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {p.rows.map((r, i) => (
                <tr key={`${r.ym}-${r.file}-${i}`} className={r.action === "skip" ? "text-muted" : ""}>
                  <th scope="row" className="px-3 py-1.5 font-medium">
                    {monthLabel(r.ym)}
                    <span className="block text-[0.75rem] font-normal text-muted">
                      {r.file}
                      {r.sheet !== r.ym && r.sheet !== monthLabel(r.ym) ? ` · ${r.sheet}` : ""}
                    </span>
                  </th>
                  <td className="px-2 py-1.5 text-right">{r.bills}</td>
                  <td className="px-2 py-1.5 text-right">{r.oneOffs}</td>
                  <td className="px-2 py-1.5 text-right">{r.income}</td>
                  <td className="px-2 py-1.5 text-right">{r.accounts}</td>
                  <td className="px-3 py-1.5">
                    <span className={`font-semibold ${r.action === "add" ? "text-good" : r.action === "replace" ? "text-ink" : ""}`}>{word(r.action)}</span>
                    {r.note && <span className="text-[0.8125rem]"> · {r.note}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {p.bridges.length > 0 && (
        <div className="rounded-lg border border-line px-3 py-2 text-sm">
          <p className="font-medium">Keeping your later months as they are</p>
          <p className="mt-0.5 text-[0.8125rem] text-muted">
            A month opens with what the month before it ended with, so months added in front of existing ones would change them. To prevent that, an
            Adjustment entry goes in the month just before each affected month. Nothing in the existing months is edited.
          </p>
          <ul className="mt-1.5 list-disc pl-5 text-[0.8125rem]">
            {p.bridges.map((b, i) => (
              <li key={i}>
                {monthLabel(b.ym)}, {b.account || "Untitled account"}:
                {b.amount !== 0 && ` Adjustment ${b.amount > 0 ? "+" : "-"}${formatMoney(Math.abs(b.amount))}`}
                {b.amount !== 0 && b.override !== 0 && " and"}
                {b.override !== 0 && ` balance override ${b.override > 0 ? "+" : "-"}${formatMoney(Math.abs(b.override))}`} so {monthLabel(b.protects)} keeps its balance
              </li>
            ))}
          </ul>
        </div>
      )}

      {p.skipped.length > 0 && (
        <ul className="divide-y divide-line rounded-lg border border-line text-sm">
          {p.skipped.map((s, i) => (
            <li key={i} className="flex flex-wrap gap-x-3 px-3 py-1.5 text-muted">
              <span className="font-medium text-ink2">{s.sheet}</span>
              <span className="text-[0.8125rem]">{s.file}</span>
              <span>Skipped: {s.reason}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
