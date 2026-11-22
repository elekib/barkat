import { parseBackup, type BookBackup } from "@/lib/backup";
import { readWorkbook, type ImportedMonth } from "@/lib/excel/read";
import { fileKind, type FileKind } from "@/lib/excel/months";

/**
 * Importing many files at once: read each one (an Excel workbook of month sheets, or a Barkat backup),
 * then work out what would happen to every month before anything is written. Pure apart from reading
 * the workbook; the store does the writing (importMonths).
 */

export interface ReadFile {
  file: string;
  kind: FileKind;
  months: ImportedMonth[];
  skipped: { sheet: string; reason: string }[];
}

/** A backup's months as importable months: stored as they were, with accounts linked by position. */
export function backupMonths(backup: BookBackup): ImportedMonth[] {
  const at = (n: number | null) => ({ accountAt: n });
  return backup.months.map((m) => ({
    ym: m.ym,
    sheet: m.ym,
    exact: true,
    banks: m.banks.map((b) => ({ name: b.name, kind: b.kind, balance: b.balance, adjust: b.adjust })),
    bills: m.bills.map((b) => ({ ...b, ...at(b.account), account: m.banks[b.account ?? -1]?.name ?? "" })),
    adHoc: m.adHoc.map((a) => ({ ...a, ...at(a.account), account: m.banks[a.account ?? -1]?.name ?? "" })),
    // Paydays a schedule made are kept as plain income: schedules are not restored into an existing book.
    incomes: m.incomes.map(({ schedule: _schedule, ...i }) => ({ ...i, ...at(i.account), account: m.banks[i.account ?? -1]?.name ?? "" })),
  }));
}

/**
 * Read one uploaded file. A workbook's sheets take `year` when their names have none (null: they are
 * skipped and said so). A backup's months carry their own years. Throws a readable error.
 */
export async function readImportFile(name: string, bytes: Uint8Array, year: number | null): Promise<ReadFile> {
  const kind = fileKind(name);
  if (kind === "backup") {
    const backup = parseBackup(new TextDecoder().decode(bytes));
    return { file: name, kind, months: backupMonths(backup), skipped: [] };
  }
  if (kind === "xlsx") {
    try {
      const read = await readWorkbook(bytes, year);
      return { file: name, kind, ...read };
    } catch {
      throw new Error(`${name} could not be read as an Excel workbook.`);
    }
  }
  throw new Error(`${name}: only .xlsx workbooks and .json backups are supported.`);
}

export type PlanAction = "add" | "replace" | "skip";

export interface PlanRow {
  file: string;
  sheet: string;
  ym: string;
  bills: number;
  oneOffs: number;
  income: number;
  accounts: number;
  kind: FileKind;
  action: PlanAction;
  /** Why a month is skipped. */
  note?: string;
}

export interface ImportPlan {
  rows: PlanRow[];
  /** Sheets that are not months, or could not be read, with the file they came from. */
  skipped: { file: string; sheet: string; reason: string }[];
  /** The months to write: one per month, oldest first. */
  write: ImportedMonth[];
}

/**
 * What an import of these files would do, month by month. A month in two files is taken from the first;
 * the second is skipped. A month already in the book is skipped, or replaced when `replace` is set.
 */
export function planImport(files: ReadFile[], existing: readonly string[], replace: boolean): ImportPlan {
  const have = new Set(existing);
  const from = new Map<string, string>();
  const rows: PlanRow[] = [];
  const write: ImportedMonth[] = [];
  const skipped: ImportPlan["skipped"] = [];

  for (const f of files) {
    for (const s of f.skipped) skipped.push({ file: f.file, sheet: s.sheet, reason: s.reason });
    for (const m of f.months) {
      const base = { file: f.file, sheet: m.sheet, ym: m.ym, bills: m.bills.length, oneOffs: m.adHoc.length, income: m.incomes.length, accounts: m.banks.length, kind: f.kind };
      const first = from.get(m.ym);
      if (first !== undefined) {
        rows.push({ ...base, action: "skip", note: `Also in ${first}` });
      } else if (have.has(m.ym) && !replace) {
        from.set(m.ym, f.file);
        rows.push({ ...base, action: "skip", note: "Already in this book" });
      } else {
        from.set(m.ym, f.file);
        rows.push({ ...base, action: have.has(m.ym) ? "replace" : "add" });
        write.push(m);
      }
    }
  }
  rows.sort((a, b) => a.ym.localeCompare(b.ym));
  write.sort((a, b) => a.ym.localeCompare(b.ym));
  return { rows, skipped, write };
}
