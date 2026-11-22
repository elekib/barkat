import ExcelJS from "exceljs";
import { outstanding, paidAmount } from "@/lib/budget/formulas";
import type { Payable } from "@/lib/budget/types";
import { monthLabel } from "@/lib/budget/months";
import { summarize } from "@/lib/budget/summary";
import type { MonthRows } from "@/lib/store";
import { BANK_PITCH, COL, FIRST_BANK_COLUMN, MIN_INCOME_ROWS, ONE_OFF, SHEET_GAP_TO_INCOME } from "./layout";

const MONEY = "#,##0.00";
const DATE = "mm/dd/yyyy";
const dollars = (cents: number) => cents / 100;
/** 1 -> A, 27 -> AA. */
function colLetter(n: number): string {
  let s = "";
  for (let k = n; k > 0; k = Math.floor((k - 1) / 26)) s = String.fromCharCode(65 + ((k - 1) % 26)) + s;
  return s;
}

/** Banks sit every few columns from E, hopping over the income Label column. */
export function bankColumn(i: number): number {
  const c = FIRST_BANK_COLUMN + i * BANK_PITCH;
  return c >= COL.incomeLabel - 1 ? c + BANK_PITCH : c;
}

/**
 * One sheet per month in the original sheet's layout, with its formulas
 * (so the file still recalculates in Excel) and last-calculated values.
 */
export async function buildWorkbook(months: { ym: string; rows: MonthRows }[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Barkat";
  const sorted = [...months].sort((a, b) => a.ym.localeCompare(b.ym));
  for (const m of sorted) writeSheet(wb.addWorksheet(monthLabel(m.ym)), m.ym, m.rows);
  if (sorted.length === 0) wb.addWorksheet("Empty");
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function writeSheet(ws: ExcelJS.Worksheet, ym: string, rows: MonthRows): void {
  const L = colLetter;
  const bold = { bold: true };

  ws.getCell("A1").value = monthLabel(ym);
  ws.getCell("A1").font = { bold: true, size: 14 };

  const headers = [
    "Expenses", "Type", "Payment Status", "Expense Projected", "Payment Amount(Start)", "Payment Amount(End)",
    "Paid Amount", "Interest Status", "Notes", "Due", "Scheduled Date", "Kind", "Tag", "Linked to",
  ];
  headers.forEach((h, i) => {
    const c = ws.getCell(2, i + 1);
    c.value = h;
    c.font = bold;
  });

  // Expense rows: bills first, then one-off payments, like zakat sat among the bills in the sheet.
  const first = 3;
  const count = rows.bills.length + rows.adHoc.length;
  const last = first + Math.max(count, 1) - 1;
  let r = first;

  ws.getCell(2, COL.account).value = "Paid from";
  ws.getCell(2, COL.account).font = bold;
  const accountName = (id: number | null) => rows.banks.find((b) => b.id === id)?.name ?? "";

  const expense = (name: string, status: string, projected: number, start: number, item: Payable) => {
    ws.getCell(r, COL.formulaToPay).value = {
      formula: `IF(OR(C${r}="Paid",C${r}="None"),0,D${r})`,
      result: dollars(outstanding(item)),
    };
    ws.getCell(r, COL.name).value = name;
    ws.getCell(r, COL.status).value = status;
    ws.getCell(r, COL.projected).value = dollars(projected);
    ws.getCell(r, COL.start).value = dollars(start);
    ws.getCell(r, COL.end).value = {
      formula: `E${r}-G${r}`,
      result: dollars(start - paidAmount(item)),
    };
    ws.getCell(r, COL.paid).value = { formula: `IF(C${r}="Paid",D${r},0)`, result: dollars(paidAmount(item)) };
  };

  for (const b of rows.bills) {
    expense(b.name, b.status, b.projected, b.startBalance, b);
    ws.getCell(r, COL.interest).value = b.interest;
    ws.getCell(r, COL.notes).value = b.notes;
    if (b.dueDay !== null) ws.getCell(r, COL.due).value = b.dueDay;
    if (b.scheduledDay !== null) ws.getCell(r, COL.scheduled).value = b.scheduledDay;
    ws.getCell(r, COL.account).value = accountName(b.bankId);
    r++;
  }
  for (const a of rows.adHoc) {
    expense(a.name, a.status, a.projected, 0, { name: a.name, status: a.status, projected: a.projected });
    ws.getCell(r, COL.notes).value = a.notes;
    ws.getCell(r, COL.kind).value = ONE_OFF;
    ws.getCell(r, COL.tag).value = a.tag;
    ws.getCell(r, COL.linkedTo).value = a.linkedTo;
    ws.getCell(r, COL.account).value = accountName(a.bankId);
    r++;
  }

  const summary = summarize({
    bills: rows.bills,
    adHoc: rows.adHoc,
    incomes: rows.incomes,
    banks: rows.banks.map((b) => b.balance + b.made),
  });
  const total = last + 1;
  const diff = total + 1;
  const toPay = summary.outstandingBills + summary.outstandingAdHoc;
  const incomeHeader = diff + SHEET_GAP_TO_INCOME;
  const incomeFirst = incomeHeader + 1;
  const pendingRow = incomeFirst + Math.max(rows.incomes.length, MIN_INCOME_ROWS);

  ws.getCell(total, COL.formulaToPay).value = { formula: `SUM(A${first}:A${last})`, result: dollars(toPay) };
  ws.getCell(total, COL.name).value = "Total";
  ws.getCell(total, COL.status).value = {
    formula: `SUMIF(C${first}:C${last},"Payment Made", A${first}:A${last})`,
    result: dollars(summary.paymentMade),
  };
  ws.getCell(total, COL.projected).value = "Payment Made Total";

  const bankCols = rows.banks.map((_, i) => bankColumn(i));
  const bankSum = bankCols.length ? bankCols.map((c) => `${L(c)}${incomeFirst}`).join("+") : "0";
  ws.getCell(diff, COL.status).value = {
    formula: `(${bankSum})-C${total}`,
    result: dollars(summary.paymentDifference),
  };
  ws.getCell(diff, COL.projected).value = "Payment Difference";

  // Income block.
  ["Income", "Date or What?", "Status", "Savings"].forEach((h, i) => {
    const c = ws.getCell(incomeHeader, i + 1);
    c.value = h;
    c.font = bold;
  });
  ws.getCell(incomeHeader, COL.incomeLabel).value = "Label";
  ws.getCell(incomeHeader, COL.incomeLabel).font = bold;
  ws.getCell(incomeHeader, COL.incomeAccount).value = "Into";
  ws.getCell(incomeHeader, COL.incomeAccount).font = bold;

  rows.incomes.forEach((inc, i) => {
    const row = incomeFirst + i;
    ws.getCell(row, 1).value = dollars(inc.amount);
    const date = ws.getCell(row, 2);
    date.value = new Date(`${inc.date}T00:00:00Z`);
    date.numFmt = DATE;
    ws.getCell(row, 3).value = inc.status;
    if (inc.label) ws.getCell(row, COL.incomeLabel).value = inc.label;
    ws.getCell(row, COL.incomeAccount).value = accountName(inc.bankId);
  });
  ws.getCell(pendingRow, 1).value = {
    formula: `SUMIF(C${incomeFirst}:C${pendingRow - 1},"Pending",A${incomeFirst}:A${pendingRow - 1})`,
    result: dollars(summary.pendingIncome),
  };

  ws.getCell(incomeFirst, 4).value = {
    formula: `(A${pendingRow}+${bankSum})-A${total}`,
    result: dollars(summary.cushion),
  };
  ws.getCell(incomeFirst + 1, 4).value = {
    formula: `IF(D${incomeFirst}>0,"Saving","Debt")`,
    result: summary.cushionLabel,
  };

  rows.banks.forEach((b, i) => {
    const c = bankCols[i];
    ws.getCell(incomeHeader, c).value = b.name;
    ws.getCell(incomeHeader, c).font = bold;
    ws.getCell(incomeFirst, c).value = dollars(b.balance + b.made);
    ws.getCell(incomeFirst, c + 1).value = b.kind;
  });

  // Look: money formats, widths.
  for (let row = first; row <= pendingRow; row++) {
    for (const col of [1, 4, 5, 6, 7]) {
      const c = ws.getCell(row, col);
      if (typeof c.value === "number" || (c.value && typeof c.value === "object" && "formula" in c.value)) c.numFmt = MONEY;
    }
  }
  for (const c of bankCols) ws.getCell(incomeFirst, c).numFmt = MONEY;
  ws.getCell(incomeFirst, 4).numFmt = MONEY;
  const widths: Record<number, number> = { 1: 12, 2: 30, 3: 15, 4: 18, 5: 20, 6: 20, 7: 12, 8: 16, 9: 28, 10: 6, 11: 14, 12: 9, 13: 14, 14: 18, 15: 16, 17: 20, 18: 16 };
  for (const [c, w] of Object.entries(widths)) ws.getColumn(Number(c)).width = w;
}
