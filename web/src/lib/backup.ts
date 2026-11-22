import { z } from "zod";
import type { Db } from "@/lib/db";
import { BILL_STATUSES, INCOME_STATUSES } from "@/lib/budget/types";
import { FREQUENCIES } from "@/lib/budget/schedules";
import { createSpace } from "@/lib/store";

/**
 * A complete copy of one book as JSON, so it can be recreated in another Barkat. Unlike the Excel
 * export (the original sheet's layout, which cannot hold everything) this keeps every month, account,
 * bill, one-off, income entry and income schedule exactly as stored, including each account's typed
 * opening balance and any admin override, so balances come out the same. Rows link to accounts and
 * schedules by position in the file, so ids never need to match. Users and settings are not included.
 */

export const BACKUP_FORMAT = 1;

const cents = z.number().int().safe();
const text = z.string().max(2000);
const ym = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** Position of an account in the same month's `banks`, or null for none. */
const link = z.number().int().min(0).nullable();

const bank = z.object({ name: text, kind: text, balance: cents, adjust: cents.default(0) });
const bill = z.object({
  name: text,
  status: z.enum(BILL_STATUSES),
  projected: cents,
  startBalance: cents,
  interest: text,
  notes: text,
  dueDay: z.number().int().min(1).max(31).nullable(),
  scheduledDay: z.number().int().min(1).max(31).nullable(),
  account: link,
});
const adHoc = z.object({ name: text, status: z.enum(BILL_STATUSES), projected: cents, tag: text, linkedTo: text, notes: text, account: link });
const income = z.object({
  label: text,
  date,
  amount: cents,
  status: z.enum(INCOME_STATUSES),
  /** Position in the file's `schedules`, for paydays a schedule generated. */
  schedule: z.number().int().min(0).nullable(),
  account: link,
});
const schedule = z.object({ label: text, amount: cents, frequency: z.enum(FREQUENCIES), anchor: date, account: text });
const month = z.object({ ym, banks: z.array(bank), bills: z.array(bill), adHoc: z.array(adHoc), incomes: z.array(income) });

export const backupSchema = z.object({
  app: z.literal("barkat"),
  format: z.literal(BACKUP_FORMAT),
  exportedAt: z.string(),
  book: z.object({ name: z.string().trim().min(1).max(80) }),
  schedules: z.array(schedule),
  months: z.array(month),
});
export type BookBackup = z.infer<typeof backupSchema>;

/** Read the whole book as stored. */
export function exportBook(db: Db, spaceId: number): BookBackup | undefined {
  const space = db.prepare("SELECT name FROM spaces WHERE id = ?").get(spaceId) as { name: string } | undefined;
  if (!space) return undefined;

  const schedRows = db.prepare("SELECT id, label, amount, frequency, anchor, account FROM income_schedules WHERE space_id = ? ORDER BY id").all(spaceId) as {
    id: number; label: string; amount: number; frequency: z.infer<typeof schedule>["frequency"]; anchor: string; account: string;
  }[];
  const schedIndex = new Map(schedRows.map((s, i) => [s.id, i]));

  const months = (db.prepare("SELECT id, ym FROM months WHERE space_id = ? ORDER BY ym").all(spaceId) as { id: number; ym: string }[]).map((m) => {
    const banks = db.prepare("SELECT id, name, kind, balance, adjust FROM banks WHERE month_id = ? ORDER BY sort, id").all(m.id) as {
      id: number; name: string; kind: string; balance: number; adjust: number;
    }[];
    const at = new Map(banks.map((b, i) => [b.id, i]));
    const account = (id: number | null) => (id !== null && at.has(id) ? at.get(id)! : null);
    return {
      ym: m.ym,
      banks: banks.map((b) => ({ name: b.name, kind: b.kind, balance: b.balance, adjust: b.adjust })),
      bills: (db.prepare(
        `SELECT name, status, projected, start_balance AS startBalance, interest, notes, due_day AS dueDay, scheduled_day AS scheduledDay, bank_id AS bankId
         FROM bills WHERE month_id = ? ORDER BY sort, id`,
      ).all(m.id) as any[]).map((r) => ({
        name: r.name, status: r.status, projected: r.projected, startBalance: r.startBalance, interest: r.interest, notes: r.notes,
        dueDay: r.dueDay, scheduledDay: r.scheduledDay, account: account(r.bankId),
      })),
      adHoc: (db.prepare("SELECT name, status, projected, tag, linked_to AS linkedTo, notes, bank_id AS bankId FROM adhoc WHERE month_id = ? ORDER BY id").all(m.id) as any[]).map((r) => ({
        name: r.name, status: r.status, projected: r.projected, tag: r.tag, linkedTo: r.linkedTo, notes: r.notes, account: account(r.bankId),
      })),
      incomes: (db.prepare("SELECT label, date, amount, status, schedule_id AS scheduleId, bank_id AS bankId FROM incomes WHERE month_id = ? ORDER BY date, id").all(m.id) as any[]).map((r) => ({
        label: r.label, date: r.date, amount: r.amount, status: r.status,
        schedule: r.scheduleId !== null && schedIndex.has(r.scheduleId) ? schedIndex.get(r.scheduleId)! : null, account: account(r.bankId),
      })),
    };
  });

  return {
    app: "barkat",
    format: BACKUP_FORMAT,
    exportedAt: new Date().toISOString(),
    book: { name: space.name },
    schedules: schedRows.map((s) => ({ label: s.label, amount: s.amount, frequency: s.frequency, anchor: s.anchor, account: s.account })),
    months,
  };
}

/** Parse and check a backup file's text. Throws a readable error. */
export function parseBackup(raw: string): BookBackup {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error("That file is not a Barkat backup (it is not valid JSON).");
  }
  const result = backupSchema.safeParse(json);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new Error(`That file is not a valid Barkat backup (${first.path.join(".") || "root"}: ${first.message}).`);
  }
  // Links must point at something that exists.
  for (const m of result.data.months) {
    const check = (n: number | null) => n === null || n < m.banks.length;
    const ok = m.bills.every((r) => check(r.account)) && m.adHoc.every((r) => check(r.account)) && m.incomes.every((r) => check(r.account) && (r.schedule === null || r.schedule < result.data.schedules.length));
    if (!ok) throw new Error(`That file is not a valid Barkat backup (month ${m.ym} points at an account or schedule that is not there).`);
  }
  return result.data;
}

/** Recreate a backed-up book as a new book. Returns its id. A name already in use gets " (2)", " (3)" and so on. */
export function restoreBook(db: Db, backup: BookBackup): number {
  const taken = new Set((db.prepare("SELECT name FROM spaces").all() as { name: string }[]).map((r) => r.name.toLowerCase()));
  let name = backup.book.name;
  for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${backup.book.name} (${n})`;

  db.exec("BEGIN");
  try {
    const spaceId = createSpace(db, name);
    const addSchedule = db.prepare("INSERT INTO income_schedules (space_id, label, amount, frequency, anchor, account) VALUES (?, ?, ?, ?, ?, ?)");
    const scheduleIds = backup.schedules.map((s) => Number(addSchedule.run(spaceId, s.label, s.amount, s.frequency, s.anchor, s.account).lastInsertRowid));

    const addMonth = db.prepare("INSERT INTO months (space_id, ym) VALUES (?, ?)");
    const addBank = db.prepare("INSERT INTO banks (month_id, name, kind, balance, adjust, sort) VALUES (?, ?, ?, ?, ?, ?)");
    const addBill = db.prepare(
      `INSERT INTO bills (month_id, name, status, projected, start_balance, interest, notes, due_day, scheduled_day, sort, bank_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const addAdHoc = db.prepare("INSERT INTO adhoc (month_id, name, status, projected, tag, linked_to, notes, bank_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    const addIncome = db.prepare("INSERT INTO incomes (month_id, label, date, amount, status, schedule_id, bank_id) VALUES (?, ?, ?, ?, ?, ?, ?)");

    for (const m of backup.months) {
      const monthId = Number(addMonth.run(spaceId, m.ym).lastInsertRowid);
      const bankIds = m.banks.map((b, i) => Number(addBank.run(monthId, b.name, b.kind, b.balance, b.adjust, i).lastInsertRowid));
      const acct = (n: number | null) => (n === null ? null : bankIds[n]);
      m.bills.forEach((b, i) => addBill.run(monthId, b.name, b.status, b.projected, b.startBalance, b.interest, b.notes, b.dueDay, b.scheduledDay, i, acct(b.account)));
      for (const a of m.adHoc) addAdHoc.run(monthId, a.name, a.status, a.projected, a.tag, a.linkedTo, a.notes, acct(a.account));
      for (const i of m.incomes) addIncome.run(monthId, i.label, i.date, i.amount, i.status, i.schedule === null ? null : scheduleIds[i.schedule], acct(i.account));
    }
    db.exec("COMMIT");
    return spaceId;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
