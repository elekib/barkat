import ExcelJS from "exceljs";
import { parseMoney } from "@/lib/budget/money";
import { BILL_STATUSES, INCOME_STATUSES, type BillStatus, type Cents, type IncomeStatus } from "@/lib/budget/types";
import { COL, FIRST_BANK_COLUMN, ONE_OFF } from "./layout";
import { parseMonthName } from "./months";

export interface ImportedBank {
  name: string;
  kind: string;
  balance: Cents;
}
export interface ImportedBill {
  name: string;
  status: BillStatus;
  projected: Cents;
  startBalance: Cents;
  interest: string;
  notes: string;
  dueDay: number | null;
  scheduledDay: number | null;
  /** Name of the account it is paid from; empty when the sheet has none. */
  account: string;
}
export interface ImportedAdHoc {
  name: string;
  status: BillStatus;
  projected: Cents;
  tag: string;
  linkedTo: string;
  notes: string;
  account: string;
}
export interface ImportedIncome {
  label: string;
  date: string;
  amount: Cents;
  status: IncomeStatus;
  account: string;
}
export interface ImportedMonth {
  ym: string;
  sheet: string;
  banks: ImportedBank[];
  bills: ImportedBill[];
  adHoc: ImportedAdHoc[];
  incomes: ImportedIncome[];
}
export interface ReadResult {
  months: ImportedMonth[];
  skipped: { sheet: string; reason: string }[];
}

/** Read every sheet of a workbook as one month. Sheets that are not months are reported, not guessed at. */
export async function readWorkbook(data: ArrayBuffer | Uint8Array, defaultYear: number): Promise<ReadResult> {
  const wb = new ExcelJS.Workbook();
  // exceljs types want a Node Buffer; the bytes are the same.
  await wb.xlsx.load(Buffer.from(data as Uint8Array) as unknown as ArrayBuffer);

  const months: ImportedMonth[] = [];
  const skipped: ReadResult["skipped"] = [];
  const seen = new Map<string, string>();

  for (const ws of wb.worksheets) {
    const ym = parseMonthName(ws.name, defaultYear) ?? parseMonthName(text(ws.getCell(1, 1)), defaultYear);
    if (!ym) {
      skipped.push({ sheet: ws.name, reason: "The name is not a month" });
      continue;
    }
    if (seen.has(ym)) {
      skipped.push({ sheet: ws.name, reason: `Same month as sheet "${seen.get(ym)}"` });
      continue;
    }
    const month = readSheet(ws, ym);
    if (!month) {
      skipped.push({ sheet: ws.name, reason: "No Expenses table found" });
      continue;
    }
    seen.set(ym, ws.name);
    months.push(month);
  }
  months.sort((a, b) => a.ym.localeCompare(b.ym));
  return { months, skipped };
}

/* ---------- cell helpers: formulas count by their last calculated value ---------- */

function raw(cell: ExcelJS.Cell): unknown {
  const v = cell.value as unknown;
  if (v && typeof v === "object" && !(v instanceof Date)) {
    const o = v as { result?: unknown; richText?: { text: string }[]; text?: string };
    if (o.richText) return o.richText.map((r) => r.text).join("");
    if ("result" in o) return o.result;
    if (typeof o.text === "string") return o.text;
    return null;
  }
  return v;
}

function text(cell: ExcelJS.Cell): string {
  const v = raw(cell);
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  return "";
}

function money(cell: ExcelJS.Cell): Cents | null {
  const v = raw(cell);
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v * 100);
  if (typeof v === "string") return v.trim() === "" ? null : parseMoney(v);
  return null;
}

function isoDate(cell: ExcelJS.Cell): string | null {
  const v = raw(cell);
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return v.trim();
  return null;
}

/** A day of the month: a plain number, or the day of a date. */
function dayOf(cell: ExcelJS.Cell): number | null {
  const v = raw(cell);
  let n: number | null = null;
  if (typeof v === "number") n = v;
  else if (v instanceof Date) n = v.getUTCDate();
  else if (typeof v === "string" && /^\d{1,2}$/.test(v.trim())) n = Number(v.trim());
  return n !== null && Number.isInteger(n) && n >= 1 && n <= 31 ? n : null;
}

function billStatus(s: string): BillStatus {
  return BILL_STATUSES.find((b) => b.toLowerCase() === s.toLowerCase()) ?? "None";
}

function incomeStatus(s: string): IncomeStatus {
  return INCOME_STATUSES.find((b) => b.toLowerCase() === s.toLowerCase()) ?? "Pending";
}

const isTotalFormula = (cell: ExcelJS.Cell) => {
  const v = cell.value as unknown;
  const f = v && typeof v === "object" ? ((v as { formula?: string; sharedFormula?: string }).formula ?? "") : "";
  return /\bSUM/i.test(f);
};

/* ---------- one sheet ---------- */

function readSheet(ws: ExcelJS.Worksheet, ym: string): ImportedMonth | null {
  let header = 0;
  let incomeHeader = 0;
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    const a = text(row.getCell(1)).toLowerCase();
    if (!header && a === "expenses") header = n;
    else if (header && !incomeHeader && n > header && a === "income") incomeHeader = n;
  });
  if (!header) return null;

  const bills: ImportedBill[] = [];
  const adHoc: ImportedAdHoc[] = [];
  const end = incomeHeader || ws.rowCount + 1;
  for (let r = header + 1; r < end; r++) {
    const name = text(ws.getCell(r, COL.name));
    if (/^total$/i.test(name)) break;
    if (!name) continue;
    const status = billStatus(text(ws.getCell(r, COL.status)));
    const projected = money(ws.getCell(r, COL.projected)) ?? 0;
    const notes = text(ws.getCell(r, COL.notes));
    if (text(ws.getCell(r, COL.kind)).toLowerCase() === ONE_OFF.toLowerCase()) {
      adHoc.push({
        name,
        status,
        projected,
        tag: text(ws.getCell(r, COL.tag)),
        linkedTo: text(ws.getCell(r, COL.linkedTo)),
        notes,
        account: text(ws.getCell(r, COL.account)),
      });
    } else {
      bills.push({
        name,
        status,
        projected,
        startBalance: money(ws.getCell(r, COL.start)) ?? 0,
        interest: text(ws.getCell(r, COL.interest)),
        notes,
        dueDay: dayOf(ws.getCell(r, COL.due)),
        scheduledDay: dayOf(ws.getCell(r, COL.scheduled)),
        account: text(ws.getCell(r, COL.account)),
      });
    }
  }

  const incomes: ImportedIncome[] = [];
  const banks: ImportedBank[] = [];
  if (incomeHeader) {
    for (let r = incomeHeader + 1; r <= ws.rowCount; r++) {
      const a = ws.getCell(r, COL.formulaToPay);
      if (isTotalFormula(a)) break;
      const amount = money(a);
      const b = ws.getCell(r, COL.name);
      const date = isoDate(b);
      const label = text(ws.getCell(r, COL.incomeLabel)) || (date ? "" : text(b));
      if (amount === null || (!date && !label && amount === 0)) continue;
      incomes.push({
        label,
        date: date ?? `${ym}-01`,
        amount,
        status: incomeStatus(text(ws.getCell(r, COL.status))),
        account: text(ws.getCell(r, COL.incomeAccount)),
      });
    }

    // Banks: a name in the header row, its balance below it, its type to the right of that.
    for (let c = FIRST_BANK_COLUMN; c <= ws.columnCount; c++) {
      if (c === COL.incomeLabel || c === COL.incomeAccount) continue;
      const name = text(ws.getCell(incomeHeader, c));
      if (!name || /prospective/i.test(name)) continue;
      const balance = money(ws.getCell(incomeHeader + 1, c));
      if (balance === null) continue;
      banks.push({ name, balance, kind: text(ws.getCell(incomeHeader + 1, c + 1)) || "Checking" });
    }
  }

  return { ym, sheet: ws.name, banks, bills, adHoc, incomes };
}
