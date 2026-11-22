"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { currentYm, isYm } from "@/lib/budget/months";
import { parseMoney } from "@/lib/budget/money";
import { readWorkbook } from "@/lib/excel/read";
import { FREQUENCIES } from "@/lib/budget/schedules";
import { BILL_STATUSES, INCOME_STATUSES } from "@/lib/budget/types";
import { adminOrNull } from "@/lib/auth/session";
import { parseBackup, restoreBook } from "@/lib/backup";
import { getDb } from "@/lib/db";
import {
  addRow,
  overrideBalance,
  addSchedule,
  bulkRows,
  bulkSchedules,
  type BulkOp,
  applySchedules,
  scheduleSpace,
  updateSchedule,
  copyIntoMonth,
  createBlankMonth,
  createMonth,
  createSpace,
  deleteSpace,
  findMonthId,
  getSpace,
  moveSpace,
  bankInMonth,
  importMonth,
  loadMonth,
  rowMonth,
  rowSpace,
  updateRow,
  type RowKind,
  type RowValues,
} from "@/lib/store";

/* ---------- field parsing ---------- */

const text = (max: number) => z.string().trim().max(max);
const money = z.string().transform((v, ctx) => {
  const cents = parseMoney(v);
  if (cents === null) ctx.addIssue({ code: "custom", message: "Not an amount" });
  return cents ?? 0;
});
const day = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (v === "") return null;
    // A date from the date picker (only its day of the month is kept), or a plain day number.
    const n = /^\d{4}-\d{2}-\d{2}$/.test(v) ? Number(v.slice(8)) : Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 31) ctx.addIssue({ code: "custom", message: "Day 1-31" });
    return n;
  });

/** An account choice: empty means no account; otherwise a bank row id (checked against the month on save). */
const accountId = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (v === "") return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1) ctx.addIssue({ code: "custom", message: "Not an account" });
    return n;
  });

/** Fields each kind of row accepts from a form. Missing fields are left alone. */
const FIELDS: Record<RowKind, Record<string, z.ZodType<string | number | null>>> = {
  bank: { name: text(80), kind: text(40), balance: money },
  bill: {
    name: text(120),
    status: z.enum(BILL_STATUSES),
    projected: money,
    startBalance: money,
    interest: text(80),
    notes: text(500),
    dueDay: day,
    scheduledDay: day,
    bankId: accountId,
  },
  income: {
    label: text(120),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    amount: money,
    status: z.enum(INCOME_STATUSES),
    bankId: accountId,
  },
  adhoc: {
    name: text(120),
    status: z.enum(BILL_STATUSES),
    projected: money,
    tag: text(60),
    linkedTo: text(120),
    notes: text(500),
    bankId: accountId,
  },
};

const kindSchema = z.enum(["bank", "bill", "income", "adhoc"]);

function parseValues(kind: RowKind, form: FormData): RowValues | null {
  const values: RowValues = {};
  for (const [field, schema] of Object.entries(FIELDS[kind])) {
    const raw = form.get(field);
    if (typeof raw !== "string") continue;
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return null;
    values[field] = parsed.data;
  }
  return values;
}

function context(form: FormData): { spaceId: number; ym: string } | null {
  const spaceId = Number(form.get("spaceId"));
  const ym = String(form.get("ym") ?? "");
  if (!Number.isInteger(spaceId) || !isYm(ym) || !getSpace(getDb(), spaceId)) return null;
  return { spaceId, ym };
}

function refresh(spaceId: number, ym: string): void {
  revalidatePath(`/s/${spaceId}/${ym}`);
}

/* ---------- actions ---------- */

export async function createSpaceAction(form: FormData): Promise<void> {
  if (!(await adminOrNull())) return;
  const name = text(80).min(1).safeParse(form.get("name"));
  if (!name.success) return;
  createSpace(getDb(), name.data);
  revalidatePath("/");
}

/** Move a book earlier or later in the order (which is also its priority). */
export async function moveSpaceAction(form: FormData): Promise<void> {
  if (!(await adminOrNull())) return;
  const id = Number(form.get("spaceId"));
  const dir = form.get("dir") === "up" ? -1 : form.get("dir") === "down" ? 1 : 0;
  const db = getDb();
  if (!Number.isInteger(id) || dir === 0 || !getSpace(db, id)) return;
  moveSpace(db, id, dir);
  revalidatePath("/", "layout");
}

/** Delete a book and everything in it. The form must carry the book's exact name, as typed in the confirmation. */
export async function deleteSpaceAction(form: FormData): Promise<void> {
  if (!(await adminOrNull())) return;
  const id = Number(form.get("spaceId"));
  if (!Number.isInteger(id)) return;
  const db = getDb();
  const space = getSpace(db, id);
  if (!space || form.get("confirm") !== space.name) return;
  deleteSpace(db, id);
  revalidatePath("/", "layout");
}

export async function createMonthAction(form: FormData): Promise<void> {
  if (!(await adminOrNull())) return;
  const ctx = context(form);
  if (!ctx) return;
  const from = form.get("from");
  createMonth(getDb(), ctx.spaceId, ctx.ym, typeof from === "string" && isYm(from) ? from : undefined);
  refresh(ctx.spaceId, ctx.ym);
}

/** Pull another month's accounts and bills into this month: merge what is missing, or replace them. */
export async function copyFromMonthAction(form: FormData): Promise<void> {
  if (!(await adminOrNull())) return;
  const ctx = context(form);
  const from = form.get("from");
  if (!ctx || typeof from !== "string" || !isYm(from)) return;
  const db = getDb();
  // A month that has not been started is created empty first, then filled with the chosen lines.
  const monthId = findMonthId(db, ctx.spaceId, ctx.ym) ?? createBlankMonth(db, ctx.spaceId, ctx.ym);
  const ids = (name: string) => form.getAll(name).map(Number).filter((n) => Number.isInteger(n));
  copyIntoMonth(db, ctx.spaceId, monthId, from, form.get("mode") === "replace" ? "replace" : "merge", {
    bankIds: ids("bankId"),
    billIds: ids("billId"),
  });
  refresh(ctx.spaceId, ctx.ym);
}

/** Add a blank row, or one filled from the form's fields. */
export async function addRowAction(form: FormData): Promise<void> {
  if (!(await adminOrNull())) return;
  const ctx = context(form);
  const kind = kindSchema.safeParse(form.get("rowKind"));
  if (!ctx || !kind.success) return;
  const db = getDb();
  const monthId = findMonthId(db, ctx.spaceId, ctx.ym);
  if (monthId === undefined) return;
  const values = parseValues(kind.data, form);
  if (!values) return;
  if (kind.data === "income" && !values.date) values.date = `${ctx.ym}-01`;
  if (typeof values.bankId === "number" && !bankInMonth(db, values.bankId, monthId)) return;
  // With a single account there is nothing to choose, so new rows go to it.
  if (kind.data !== "bank" && values.bankId === undefined) {
    const banks = loadMonth(db, monthId).banks;
    if (banks.length === 1) values.bankId = banks[0].id;
  }
  addRow(db, kind.data, monthId, values);
  refresh(ctx.spaceId, ctx.ym);
}

/** Save the fields in a row's form. Bad input is ignored, so the row keeps its last good value. */
export async function saveRowAction(form: FormData): Promise<void> {
  if (!(await adminOrNull())) return;
  const ctx = context(form);
  const kind = kindSchema.safeParse(form.get("rowKind"));
  const id = Number(form.get("id"));
  if (!ctx || !kind.success || !Number.isInteger(id)) return;
  const db = getDb();
  if (rowSpace(db, kind.data, id) !== ctx.spaceId) return;
  const values = parseValues(kind.data, form);
  const monthId = rowMonth(db, kind.data, id);
  const badAccount = typeof values?.bankId === "number" && (monthId === undefined || !bankInMonth(db, values.bankId, monthId));
  if (values && !badAccount) updateRow(db, kind.data, id, values);
  refresh(ctx.spaceId, ctx.ym);
}

/**
 * Save everything in the Manage accounts dialog at once: each listed account's name, type and balance
 * (a new balance is an admin override: it is set as given, without an entry, and later entries and
 * months carry on from it), and any new accounts added with "Add account" (a new row with no name is ignored).
 */
export async function saveAccountsAction(form: FormData): Promise<void> {
  if (!(await adminOrNull())) return;
  const ctx = context(form);
  if (!ctx) return;
  const db = getDb();
  const monthId = findMonthId(db, ctx.spaceId, ctx.ym);
  if (monthId === undefined) return;

  const ids = form.getAll("rowId");
  const names = form.getAll("name");
  const kinds = form.getAll("kind");
  const balances = form.getAll("balance");
  ids.forEach((raw, i) => {
    const id = Number(raw);
    if (!Number.isInteger(id) || rowSpace(db, "bank", id) !== ctx.spaceId || rowMonth(db, "bank", id) !== monthId) return;
    const name = text(80).min(1).safeParse(names[i]);
    const kind = text(40).safeParse(kinds[i] ?? "");
    if (name.success && kind.success) updateRow(db, "bank", id, { name: name.data, kind: kind.data });
    const balance = typeof balances[i] === "string" ? money.safeParse(balances[i]) : null;
    if (balance?.success) overrideBalance(db, monthId, id, balance.data as number);
  });

  const newNames = form.getAll("newName");
  const newKinds = form.getAll("newKind");
  const newBalances = form.getAll("newBalance");
  newNames.forEach((raw, i) => {
    const name = text(80).min(1).safeParse(raw);
    if (!name.success) return;
    const kind = text(40).safeParse(newKinds[i] ?? "");
    const balance = money.safeParse(String(newBalances[i] ?? ""));
    // The starting balance is an override too (not part of the opening), so it stays out of trends.
    const id = addRow(db, "bank", monthId, { name: name.data, kind: kind.success ? kind.data : "", balance: 0 });
    if (balance.success) overrideBalance(db, monthId, id, balance.data as number);
  });
  refresh(ctx.spaceId, ctx.ym);
}

/* ---------- income schedules ---------- */

const SCHEDULE_FIELDS: Record<string, z.ZodType<string | number | null>> = {
  label: text(120),
  amount: money,
  frequency: z.enum(FREQUENCIES),
  anchor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  account: text(80),
};

function parseSchedule(form: FormData): RowValues | null {
  const values: RowValues = {};
  for (const [field, schema] of Object.entries(SCHEDULE_FIELDS)) {
    const raw = form.get(field);
    if (typeof raw !== "string") continue;
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return null;
    values[field] = parsed.data;
  }
  return values;
}

export async function addScheduleAction(form: FormData): Promise<void> {
  if (!(await adminOrNull())) return;
  const ctx = context(form);
  if (!ctx) return;
  // The first payday defaults to the first of the viewed month; the user then sets the real one.
  addSchedule(getDb(), ctx.spaceId, { anchor: `${ctx.ym}-01` });
  refresh(ctx.spaceId, ctx.ym);
}

export async function saveScheduleAction(form: FormData): Promise<void> {
  if (!(await adminOrNull())) return;
  const ctx = context(form);
  const id = Number(form.get("id"));
  if (!ctx || !Number.isInteger(id)) return;
  const db = getDb();
  if (scheduleSpace(db, id) !== ctx.spaceId) return;
  const values = parseSchedule(form);
  if (values) updateSchedule(db, id, values);
  refresh(ctx.spaceId, ctx.ym);
}

/**
 * One change to the selected rows of one table: delete them, set a status, or set an account.
 * The ids come from the table's checkboxes; each is checked against the space in the store.
 */
export async function bulkAction(form: FormData): Promise<void> {
  if (!(await adminOrNull())) return;
  const ctx = context(form);
  const target = z.enum(["bank", "bill", "income", "adhoc", "schedule"]).safeParse(form.get("rowKind"));
  const op = z.enum(["delete", "status", "account"]).safeParse(form.get("op"));
  if (!ctx || !target.success || !op.success) return;
  const ids = form.getAll("id").map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length === 0) return;
  const value = form.get("value");
  const db = getDb();

  let change: BulkOp | null = null;
  if (op.data === "delete") change = { type: "delete" };
  else if (typeof value === "string" && op.data === "status" && target.data !== "bank" && target.data !== "schedule") {
    const ok = z.enum(target.data === "income" ? INCOME_STATUSES : BILL_STATUSES).safeParse(value);
    if (ok.success) change = { type: "set", values: { status: ok.data } };
  } else if (typeof value === "string" && op.data === "account") {
    if (target.data === "schedule") {
      const name = text(80).safeParse(value);
      if (name.success) change = { type: "set", values: { account: name.data } };
    } else if (target.data !== "bank") {
      const id = accountId.safeParse(value);
      if (id.success) change = { type: "set", values: { bankId: id.data } };
    }
  }
  if (!change) return;

  if (target.data === "schedule") bulkSchedules(db, ctx.spaceId, ids, change);
  else bulkRows(db, ctx.spaceId, target.data, ids, change);
  refresh(ctx.spaceId, ctx.ym);
}

/** Fill this month's income from the schedules, skipping paydays already there. */
export async function applySchedulesAction(form: FormData): Promise<void> {
  if (!(await adminOrNull())) return;
  const ctx = context(form);
  if (!ctx) return;
  const db = getDb();
  const monthId = findMonthId(db, ctx.spaceId, ctx.ym);
  if (monthId === undefined) return;
  applySchedules(db, ctx.spaceId, monthId, ctx.ym);
  refresh(ctx.spaceId, ctx.ym);
}

/* ---------- import ---------- */

export interface ImportState {
  error?: string;
  results?: { sheet: string; ym?: string; outcome: string }[];
}

const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

/** Import every month sheet of an uploaded .xlsx into a space. */
export async function importAction(_prev: ImportState, form: FormData): Promise<ImportState> {
  if (!(await adminOrNull())) return { error: "Only an admin can import." };
  const spaceId = Number(form.get("spaceId"));
  const db = getDb();
  if (!Number.isInteger(spaceId) || !getSpace(db, spaceId)) return { error: "Unknown space." };
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an .xlsx file." };
  if (file.size > MAX_IMPORT_BYTES) return { error: "That file is over 10 MB." };
  if (!/\.xlsx$/i.test(file.name)) return { error: "Only .xlsx files are supported." };

  const year = Number(form.get("year"));
  if (!Number.isInteger(year) || year < 1990 || year > 2200) return { error: "Enter a four-digit year." };
  const replace = form.get("replace") === "on";
  const defaultToFirstAccount = form.get("firstAccount") === "on";

  let read;
  try {
    read = await readWorkbook(new Uint8Array(await file.arrayBuffer()), year);
  } catch {
    return { error: "That file could not be read as an Excel workbook." };
  }

  const results: NonNullable<ImportState["results"]> = [];
  for (const m of read.months) {
    const outcome = importMonth(db, spaceId, m, replace, { defaultToFirstAccount });
    results.push({
      sheet: m.sheet,
      ym: m.ym,
      outcome:
        outcome === "skipped"
          ? "Skipped: month already exists"
          : `${outcome === "replaced" ? "Replaced" : "Imported"}: ${m.bills.length} bills, ${m.adHoc.length} one-offs, ${m.incomes.length} income, ${m.banks.length} banks`,
    });
  }
  for (const s of read.skipped) results.push({ sheet: s.sheet, outcome: `Skipped: ${s.reason}` });

  revalidatePath(`/s/${spaceId}`, "layout");
  return { results };
}

/** Recreate a book from a Barkat backup file (.json) as a new book, then open it. */
export async function restoreBookAction(_prev: { error?: string }, form: FormData): Promise<{ error?: string }> {
  if (!(await adminOrNull())) return { error: "Only an admin can restore a book." };
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a backup file (.json)." };
  if (file.size > MAX_IMPORT_BYTES * 5) return { error: "That file is over 50 MB." };
  let id: number;
  try {
    id = restoreBook(getDb(), parseBackup(await file.text()));
  } catch (err) {
    return { error: err instanceof Error ? err.message : "That file could not be restored." };
  }
  revalidatePath("/", "layout");
  redirect(`/s/${id}/${currentYm()}`);
}
