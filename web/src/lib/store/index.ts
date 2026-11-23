import type { Db } from "@/lib/db";
import { monthEnd, monthStart } from "@/lib/budget/months";
import { addDays, endBalance } from "@/lib/budget/formulas";
import type { BillStatus, Cents, IncomeStatus } from "@/lib/budget/types";
import type { ImportedMonth } from "@/lib/excel/read";
import { scheduleDates, type Frequency } from "@/lib/budget/schedules";
import { carryBalances, type LedgerLine, type LedgerMonth } from "@/lib/budget/ledger";

/* ---------- row types ---------- */

export interface Space {
  id: number;
  name: string;
}

export interface BankRow {
  id: number;
  name: string;
  kind: string;
  /**
   * What the account holds now. Carried from earlier months and moved by entries (see lib/budget/ledger.ts),
   * net of payments marked Payment Made.
   */
  balance: Cents;
  /** Where this month starts. Typed in the account's first month, carried from the month before after that. */
  opening: Cents;
  /** True when the opening is carried, so it is not typed. */
  carried: boolean;
  /** Payments from this account marked Payment Made. `balance + made` is the sheet's bank figure. */
  made: Cents;
  /** An admin override of this month's balance, on top of the entries. */
  adjust: Cents;
  /** The balance without any admin override, for trends: changes made in Manage accounts are not income or spending. */
  organic: Cents;
}

export interface BillRow {
  id: number;
  name: string;
  status: BillStatus;
  projected: Cents;
  startBalance: Cents;
  interest: string;
  notes: string;
  dueDay: number | null;
  scheduledDay: number | null;
  bankId: number | null;
}

export interface IncomeRow {
  id: number;
  label: string;
  date: string;
  amount: Cents;
  status: IncomeStatus;
  /** The schedule that generated this row, if any. */
  scheduleId: number | null;
  bankId: number | null;
}

export interface ScheduleRow {
  id: number;
  label: string;
  amount: Cents;
  frequency: Frequency;
  anchor: string;
  /** Name of the account it pays into; matched to each month's bank row by name. */
  account: string;
}

export interface AdHocRow {
  id: number;
  name: string;
  status: BillStatus;
  projected: Cents;
  tag: string;
  linkedTo: string;
  notes: string;
  bankId: number | null;
}

export interface MonthRows {
  monthId: number;
  banks: BankRow[];
  bills: BillRow[];
  incomes: IncomeRow[];
  adHoc: AdHocRow[];
}

/* ---------- spaces ---------- */

export function listSpaces(db: Db): Space[] {
  return db.prepare("SELECT id, name FROM spaces ORDER BY sort, id").all() as unknown as Space[];
}

export function getSpace(db: Db, id: number): Space | undefined {
  return db.prepare("SELECT id, name FROM spaces WHERE id = ?").get(id) as unknown as Space | undefined;
}

export function createSpace(db: Db, name: string): number {
  const next = db.prepare("SELECT COALESCE(MAX(sort), 0) + 1 AS n FROM spaces").get() as { n: number };
  const res = db.prepare("INSERT INTO spaces (name, sort) VALUES (?, ?)").run(name, next.n);
  return Number(res.lastInsertRowid);
}

/** Move a space one place earlier (-1) or later (1) in the order. The order is also the priority. */
export function moveSpace(db: Db, id: number, dir: -1 | 1): void {
  const ids = listSpaces(db).map((sp) => sp.id);
  const from = ids.indexOf(id);
  const to = from + dir;
  if (from < 0 || to < 0 || to >= ids.length) return;
  [ids[from], ids[to]] = [ids[to], ids[from]];
  const set = db.prepare("UPDATE spaces SET sort = ? WHERE id = ?");
  ids.forEach((sid, i) => set.run(i + 1, sid));
}

/** Deleting a space removes all of this with it (the tables cascade). Counted for the confirmation. */
export interface SpaceContents {
  months: number;
  accounts: number;
  bills: number;
  oneOffs: number;
  income: number;
  schedules: number;
}

export function spaceContents(db: Db, id: number): SpaceContents {
  const n = (sql: string) => (db.prepare(sql).get(id) as { n: number }).n;
  const inMonths = (table: string) => n(`SELECT COUNT(*) AS n FROM ${table} WHERE month_id IN (SELECT id FROM months WHERE space_id = ?)`);
  return {
    months: n("SELECT COUNT(*) AS n FROM months WHERE space_id = ?"),
    accounts: inMonths("banks"),
    bills: inMonths("bills"),
    oneOffs: inMonths("adhoc"),
    income: inMonths("incomes"),
    schedules: n("SELECT COUNT(*) AS n FROM income_schedules WHERE space_id = ?"),
  };
}

export function deleteSpace(db: Db, id: number): void {
  db.prepare("DELETE FROM spaces WHERE id = ?").run(id);
}

/* ---------- months ---------- */

export function findMonthId(db: Db, spaceId: number, ym: string): number | undefined {
  const row = db.prepare("SELECT id FROM months WHERE space_id = ? AND ym = ?").get(spaceId, ym) as
    | { id: number }
    | undefined;
  return row?.id;
}

/** The newest existing month before `ym`, if any. */
export function previousMonth(db: Db, spaceId: number, ym: string): string | undefined {
  const row = db
    .prepare("SELECT ym FROM months WHERE space_id = ? AND ym < ? ORDER BY ym DESC LIMIT 1")
    .get(spaceId, ym) as { ym: string } | undefined;
  return row?.ym;
}

export function listMonths(db: Db, spaceId: number): string[] {
  const rows = db.prepare("SELECT ym FROM months WHERE space_id = ? ORDER BY ym DESC").all(spaceId) as {
    ym: string;
  }[];
  return rows.map((r) => r.ym);
}

/**
 * Start a month from the newest earlier one, like copying last month's sheet:
 *  - bills keep their name, due day, amount and notes; status resets (Pending
 *    if there is an amount, None if not); the start balance is last month's end
 *  - income: if the space has income schedules, their paydays are generated;
 *    otherwise last month's income carries on weekly. All Pending
 *  - bank balances carry over
 *  - ad-hoc payments are one-offs and are not copied
 * With no earlier month it starts empty. Returns the month id; does nothing if it exists.
 */
export function createMonth(db: Db, spaceId: number, ym: string, fromYm?: string): number {
  const existing = findMonthId(db, spaceId, ym);
  if (existing !== undefined) return existing;

  db.exec("BEGIN");
  try {
    // A month started in front of every other one must not change them (see keepOpenings).
    const before = startsBeforeAll(db, spaceId, ym) ? openingsOf(db, spaceId) : null;
    const res = db.prepare("INSERT INTO months (space_id, ym) VALUES (?, ?)").run(spaceId, ym);
    const monthId = Number(res.lastInsertRowid);
    // Copy from the month asked for (any other month in the space), else the newest earlier one.
    const prev = fromYm && fromYm !== ym && findMonthId(db, spaceId, fromYm) !== undefined ? fromYm : previousMonth(db, spaceId, ym);
    if (prev) copyForward(db, spaceId, findMonthId(db, spaceId, prev)!, monthId, ym);
    else applySchedules(db, spaceId, monthId, ym);
    if (before) keepOpenings(db, spaceId, before, new Set([ym]));
    db.exec("COMMIT");
    return monthId;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

/**
 * Bring another month's accounts and bills into one that already exists. "merge" does not
 * duplicate: an account or bill whose name (any case) is already there is left alone.
 * "replace" first clears this month's bills and accounts, so it becomes a copy of the source. Copied bills reset
 * their status like a new month and keep their account. Income is not copied; use the schedules.
 */
export function copyIntoMonth(
  db: Db,
  spaceId: number,
  toId: number,
  fromYm: string,
  mode: "merge" | "replace" = "merge",
  /** Only these source rows are copied. An account is also copied when a chosen bill is paid from it. */
  selection?: { bankIds: number[]; billIds: number[] },
): { banks: number; bills: number } | undefined {
  const fromId = findMonthId(db, spaceId, fromYm);
  if (fromId === undefined || fromId === toId) return undefined;
  const toYm = (db.prepare("SELECT ym FROM months WHERE id = ?").get(toId) as { ym: string }).ym;
  const all = loadMonth(db, fromId);
  const pickedBills = selection ? all.bills.filter((b) => selection.billIds.includes(b.id)) : all.bills;
  const needed = new Set(selection ? [...selection.bankIds, ...pickedBills.flatMap((b) => (b.bankId !== null ? [b.bankId] : []))] : all.banks.map((b) => b.id));
  const from = { ...all, bills: pickedBills, banks: all.banks.filter((b) => needed.has(b.id)) };
  let to = loadMonth(db, toId);
  const key = (n: string) => n.trim().toLowerCase();
  let banks = 0;
  let bills = 0;

  db.exec("BEGIN");
  try {
    const before = startsBeforeAll(db, spaceId, toYm) ? openingsOf(db, spaceId) : null;
    // Replace: this month's accounts and bills are swapped for the source's. One-offs and income stay,
    // and are pointed at the new account with the same name (or none).
    const keepLinks =
      mode === "replace"
        ? {
            adhoc: to.adHoc.map((r) => [r.id, to.banks.find((b) => b.id === r.bankId)?.name] as const),
            incomes: to.incomes.map((r) => [r.id, to.banks.find((b) => b.id === r.bankId)?.name] as const),
          }
        : null;
    if (mode === "replace") {
      db.prepare("DELETE FROM bills WHERE month_id = ?").run(toId);
      db.prepare("DELETE FROM banks WHERE month_id = ?").run(toId);
      to = { ...to, banks: [], bills: [] };
    }
    const bankMap = new Map<number, number>();
    const addBank = db.prepare("INSERT INTO banks (month_id, name, kind, balance, sort) VALUES (?, ?, ?, ?, ?)");
    let sort = to.banks.length;
    for (const b of from.banks) {
      const same = to.banks.find((x) => key(x.name) === key(b.name));
      if (same) bankMap.set(b.id, same.id);
      else {
        bankMap.set(b.id, Number(addBank.run(toId, b.name, b.kind, b.balance, sort++).lastInsertRowid));
        banks++;
      }
    }
    const have = new Set(to.bills.map((b) => key(b.name)));
    const addBill = db.prepare(
      `INSERT INTO bills (month_id, name, status, projected, start_balance, interest, notes, due_day, scheduled_day, sort, bank_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    );
    let order = to.bills.length;
    for (const b of from.bills) {
      if (have.has(key(b.name))) continue;
      const status: BillStatus = b.projected > 0 ? "Pending" : "None";
      const start = endBalance({ name: b.name, status: b.status, projected: b.projected, startBalance: b.startBalance });
      addBill.run(toId, b.name, status, b.projected, start, b.interest, b.notes, b.dueDay, order++, b.bankId !== null ? (bankMap.get(b.bankId) ?? null) : null);
      bills++;
    }
    if (keepLinks) {
      const nowBanks = loadMonth(db, toId).banks;
      const relink = (table: "adhoc" | "incomes", links: readonly (readonly [number, string | undefined])[]) => {
        const set = db.prepare(`UPDATE ${table} SET bank_id = ? WHERE id = ?`);
        for (const [id, name] of links) set.run(name ? (nowBanks.find((b) => key(b.name) === key(name))?.id ?? null) : null, id);
      };
      relink("adhoc", keepLinks.adhoc);
      relink("incomes", keepLinks.incomes);
    }
    if (before) keepOpenings(db, spaceId, before, new Set([toYm]));
    db.exec("COMMIT");
    return { banks, bills };
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

/** An empty month row, with nothing copied in. For when the user picks what to bring over themselves. */
export function createBlankMonth(db: Db, spaceId: number, ym: string): number {
  const existing = findMonthId(db, spaceId, ym);
  if (existing !== undefined) return existing;
  return Number(db.prepare("INSERT INTO months (space_id, ym) VALUES (?, ?)").run(spaceId, ym).lastInsertRowid);
}

function copyForward(db: Db, spaceId: number, fromId: number, toId: number, toYm: string): void {
  const from = loadMonth(db, fromId);

  const addBank = db.prepare("INSERT INTO banks (month_id, name, kind, balance, sort) VALUES (?, ?, ?, ?, ?)");
  // Old bank row id -> new, so each payment keeps its account in the new month.
  const bankMap = new Map<number, number>();
  from.banks.forEach((b, i) => bankMap.set(b.id, Number(addBank.run(toId, b.name, b.kind, b.balance, i).lastInsertRowid)));
  const mapBank = (id: number | null) => (id !== null ? (bankMap.get(id) ?? null) : null);

  const addBill = db.prepare(
    `INSERT INTO bills (month_id, name, status, projected, start_balance, interest, notes, due_day, scheduled_day, sort, bank_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
  );
  from.bills.forEach((b, i) => {
    const status: BillStatus = b.projected > 0 ? "Pending" : "None";
    const start = endBalance({ name: b.name, status: b.status, projected: b.projected, startBalance: b.startBalance });
    addBill.run(toId, b.name, status, b.projected, start, b.interest, b.notes, b.dueDay, i, mapBank(b.bankId));
  });

  if (listSchedules(db, spaceId).length > 0) {
    applySchedules(db, spaceId, toId, toYm);
  } else if (from.incomes.length > 0) {
    // Continue the weekly rhythm: the next dates after the last one, inside the new month.
    const sorted = [...from.incomes].sort((a, b) => a.date.localeCompare(b.date));
    let date = addDays(sorted[sorted.length - 1].date, 7);
    while (date < monthStart(toYm)) date = addDays(date, 7);
    const addIncome = db.prepare("INSERT INTO incomes (month_id, label, date, amount, status, bank_id) VALUES (?, ?, ?, ?, 'Pending', ?)");
    for (const inc of sorted) {
      addIncome.run(toId, inc.label, date, inc.amount, mapBank(inc.bankId));
      date = addDays(date, 7);
    }
  }
}

/** The ledger inputs of a month's raw rows. */
export function ledgerMonth(rows: MonthRows): LedgerMonth {
  return {
    accounts: rows.banks.map((b) => ({ id: b.id, name: b.name, stored: b.balance, adjust: b.adjust })),
    incomes: rows.incomes.map((i) => ({ bankId: i.bankId, amount: i.amount, status: i.status })),
    payments: [...rows.bills, ...rows.adHoc].map((p) => ({ bankId: p.bankId, amount: p.projected, status: p.status })),
  };
}

/** The same month with every admin override left out, for trends. */
function plainLedger(rows: MonthRows): LedgerMonth {
  const l = ledgerMonth(rows);
  return { ...l, accounts: l.accounts.map((a) => ({ ...a, adjust: 0 })) };
}

/** A month's raw rows with the balances a ledger worked out for it (with and without overrides). */
function withLedger(raw: MonthRows, mine: LedgerLine[], organic: LedgerLine[]): MonthRows {
  return {
    ...raw,
    banks: raw.banks.map((b) => {
      const l = mine.find((x) => x.id === b.id);
      return l ? { ...b, balance: l.balance, opening: l.opening, carried: l.carried, made: l.made, organic: organic.find((x) => x.id === b.id)?.balance ?? l.balance } : b;
    }),
  };
}

/** A month with its account balances worked out from every month up to it. */
export function loadMonth(db: Db, monthId: number): MonthRows {
  const info = db.prepare("SELECT space_id AS spaceId, ym FROM months WHERE id = ?").get(monthId) as { spaceId: number; ym: string } | undefined;
  const raw = loadMonthRaw(db, monthId);
  if (!info) return raw;
  const ids = db.prepare("SELECT id FROM months WHERE space_id = ? AND ym <= ? ORDER BY ym").all(info.spaceId, info.ym) as { id: number }[];
  const chain = ids.map((m) => (m.id === monthId ? raw : loadMonthRaw(db, m.id)));
  const ledger = carryBalances(chain.map(ledgerMonth));
  const plain = carryBalances(chain.map(plainLedger));
  return withLedger(raw, ledger[ledger.length - 1] ?? [], plain[plain.length - 1] ?? []);
}

export function loadMonthRaw(db: Db, monthId: number): MonthRows {
  const banks = db
    .prepare("SELECT id, name, kind, balance, adjust FROM banks WHERE month_id = ? ORDER BY sort, id")
    .all(monthId) as unknown as BankRow[];
  const bills = (
    db
      .prepare(
        `SELECT id, name, status, projected, start_balance AS startBalance, interest, notes,
                due_day AS dueDay, scheduled_day AS scheduledDay, bank_id AS bankId
         FROM bills WHERE month_id = ? ORDER BY sort, id`,
      )
      .all(monthId) as unknown as BillRow[]
  ).map((r) => ({ ...r }));
  const incomes = db
    .prepare("SELECT id, label, date, amount, status, schedule_id AS scheduleId, bank_id AS bankId FROM incomes WHERE month_id = ? ORDER BY date, id")
    .all(monthId) as unknown as IncomeRow[];
  const adHoc = db
    .prepare(
      `SELECT id, name, status, projected, tag, linked_to AS linkedTo, notes, bank_id AS bankId
       FROM adhoc WHERE month_id = ? ORDER BY id`,
    )
    .all(monthId) as unknown as AdHocRow[];
  return {
    monthId,
    banks: banks.map((r) => ({ ...r, opening: r.balance, carried: false, made: 0, organic: r.balance })),
    bills,
    incomes: incomes.map((r) => ({ ...r })),
    adHoc: adHoc.map((r) => ({ ...r })),
  };
}

/**
 * Every month in a space, oldest first, with its rows. For trends across months. The balances are
 * carried once down the whole chain, so many years of months cost one pass, not one per month.
 */
export function listMonthRows(db: Db, spaceId: number): { ym: string; rows: MonthRows }[] {
  const months = db.prepare("SELECT id, ym FROM months WHERE space_id = ? ORDER BY ym").all(spaceId) as {
    id: number;
    ym: string;
  }[];
  const raw = months.map((m) => loadMonthRaw(db, m.id));
  const ledger = carryBalances(raw.map(ledgerMonth));
  const plain = carryBalances(raw.map(plainLedger));
  return months.map((m, i) => ({ ym: m.ym, rows: withLedger(raw[i], ledger[i], plain[i]) }));
}

/** Each month of a space, newest first, with how many rows (accounts, bills, one-offs, income) it holds. */
export function listMonthSizes(db: Db, spaceId: number): { ym: string; items: number }[] {
  return (
    db
      .prepare(
        `SELECT m.ym AS ym,
                (SELECT COUNT(*) FROM banks WHERE month_id = m.id) + (SELECT COUNT(*) FROM bills WHERE month_id = m.id)
                + (SELECT COUNT(*) FROM adhoc WHERE month_id = m.id) + (SELECT COUNT(*) FROM incomes WHERE month_id = m.id) AS items
         FROM months m WHERE m.space_id = ? ORDER BY m.ym DESC`,
      )
      .all(spaceId) as { ym: string; items: number }[]
  ).map((r) => ({ ym: r.ym, items: r.items }));
}

/**
 * The months after `afterYm` (newest first) with how many lines each holds. Used to show what "clear future
 * months" would remove before anything is deleted.
 */
export function futureMonths(db: Db, spaceId: number, afterYm: string): { ym: string; items: number }[] {
  return listMonthSizes(db, spaceId).filter((m) => m.ym > afterYm);
}

/**
 * Delete one month with everything in it, but only if it is after `afterYm` (a future month): removing a month
 * in the middle of the history would change the balances that carry into the months after it. Returns whether
 * a month was deleted.
 */
export function clearMonth(db: Db, spaceId: number, ym: string, afterYm: string): boolean {
  if (ym <= afterYm) return false;
  return Number(db.prepare("DELETE FROM months WHERE space_id = ? AND ym = ?").run(spaceId, ym).changes) > 0;
}

/**
 * Delete every month after `afterYm`, with its accounts, bills, one-offs and income. Earlier months are not
 * touched: balances carry forward, so nothing before the cut can change. Income schedules stay, and start
 * generating paydays again when a month is started later. Returns the months removed.
 */
export function clearFutureMonths(db: Db, spaceId: number, afterYm: string): string[] {
  const doomed = futureMonths(db, spaceId, afterYm).map((m) => m.ym);
  if (doomed.length === 0) return [];
  db.exec("BEGIN");
  try {
    const del = db.prepare("DELETE FROM months WHERE space_id = ? AND ym = ?");
    for (const ym of doomed) del.run(spaceId, ym);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  return doomed;
}

/* ---------- rows ---------- */

export type RowKind = "bank" | "bill" | "income" | "adhoc";

/** Table and editable columns per kind. Only these names ever reach SQL. */
const TABLES: Record<RowKind, { table: string; columns: Record<string, string> }> = {
  bank: { table: "banks", columns: { name: "name", kind: "kind", balance: "balance" } },
  bill: {
    table: "bills",
    columns: {
      name: "name",
      status: "status",
      projected: "projected",
      startBalance: "start_balance",
      interest: "interest",
      notes: "notes",
      dueDay: "due_day",
      scheduledDay: "scheduled_day",
      bankId: "bank_id",
    },
  },
  income: { table: "incomes", columns: { label: "label", date: "date", amount: "amount", status: "status", bankId: "bank_id" } },
  adhoc: {
    table: "adhoc",
    columns: { name: "name", status: "status", projected: "projected", tag: "tag", linkedTo: "linked_to", notes: "notes", bankId: "bank_id" },
  },
};

export type RowValues = Record<string, string | number | null>;

function pick(kind: RowKind, values: RowValues): [string, string | number | null][] {
  const cols = TABLES[kind].columns;
  return Object.entries(values).flatMap(([key, v]) => (key in cols ? [[cols[key], v] as [string, string | number | null]] : []));
}

/** Add a row to a month. `values` use the camelCase names above. A new account also appears in every later month. */
export function addRow(db: Db, kind: RowKind, monthId: number, values: RowValues): number {
  const id = insertRow(db, kind, monthId, values);
  if (kind === "bank") {
    const later = monthsAfter(db, monthId);
    const have = new Set((db.prepare("SELECT name FROM banks WHERE id = ?").all(id) as { name: string }[]).map((r) => r.name.trim().toLowerCase()));
    for (const m of later) {
      const names = (db.prepare("SELECT name FROM banks WHERE month_id = ?").all(m) as { name: string }[]).map((r) => r.name.trim().toLowerCase());
      if (names.some((n) => have.has(n))) continue;
      insertRow(db, kind, m, { ...values, balance: 0 });
    }
  }
  return id;
}

function insertRow(db: Db, kind: RowKind, monthId: number, values: RowValues): number {
  const entries = pick(kind, values);
  const { table } = TABLES[kind];
  const cols = ["month_id", ...entries.map(([c]) => c)];
  const sql = `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`;
  const res = db.prepare(sql).run(monthId, ...entries.map(([, v]) => v));
  return Number(res.lastInsertRowid);
}

/** The later months of the same book. */
function monthsAfter(db: Db, monthId: number): number[] {
  return (
    db
      .prepare("SELECT m2.id FROM months m1 JOIN months m2 ON m2.space_id = m1.space_id AND m2.ym > m1.ym WHERE m1.id = ?")
      .all(monthId) as { id: number }[]
  ).map((r) => r.id);
}

/** Change fields on one row. Unknown field names are ignored. Renaming an account renames it in every month. */
export function updateRow(db: Db, kind: RowKind, id: number, values: RowValues): void {
  const entries = pick(kind, values);
  if (entries.length === 0) return;
  const { table } = TABLES[kind];
  let before: { name: string; spaceId: number; monthId: number } | undefined;
  if (kind === "bank" && typeof values.name === "string") {
    before = db.prepare("SELECT b.name AS name, m.space_id AS spaceId, b.month_id AS monthId FROM banks b JOIN months m ON m.id = b.month_id WHERE b.id = ?").get(id) as typeof before;
  }
  const sql = `UPDATE ${table} SET ${entries.map(([c]) => `${c} = ?`).join(", ")} WHERE id = ?`;
  db.prepare(sql).run(...entries.map(([, v]) => v), id);
  if (before && typeof values.name === "string" && values.name.trim().toLowerCase() !== before.name.trim().toLowerCase()) {
    // The same account in the book's other months. Accounts sharing a name are told apart by their
    // order in the month, so renaming one never renames its namesake.
    const same = (monthId: number) =>
      (db.prepare("SELECT id FROM banks WHERE month_id = ? AND lower(trim(name)) = lower(trim(?)) ORDER BY sort, id").all(monthId, before!.name) as { id: number }[]).map((r) => r.id);
    // `before.name` no longer matches this row (it was just renamed), so its place is counted from the others' order.
    const months = db.prepare("SELECT id FROM months WHERE space_id = ? AND id != ?").all(before.spaceId, before.monthId) as { id: number }[];
    const rank = (db.prepare("SELECT COUNT(*) AS n FROM banks WHERE month_id = ? AND (sort, id) < (SELECT sort, id FROM banks WHERE id = ?) AND lower(trim(name)) = lower(trim(?))").get(before.monthId, id, before.name) as { n: number }).n;
    const set = db.prepare("UPDATE banks SET name = ? WHERE id = ?");
    for (const m of months) {
      const ids = same(m.id);
      if (ids.length > 0) set.run(values.name, ids[Math.min(rank, ids.length - 1)]);
    }
  }
}

/** Deleting an account removes it from this month and every later one. */
export function deleteRow(db: Db, kind: RowKind, id: number): void {
  if (kind === "bank") {
    const row = db.prepare("SELECT b.name AS name, m.space_id AS spaceId, m.ym AS ym FROM banks b JOIN months m ON m.id = b.month_id WHERE b.id = ?").get(id) as
      | { name: string; spaceId: number; ym: string }
      | undefined;
    if (row) {
      db.prepare(
        `DELETE FROM banks WHERE lower(trim(name)) = lower(trim(?))
         AND month_id IN (SELECT id FROM months WHERE space_id = ? AND ym >= ?)`,
      ).run(row.name, row.spaceId, row.ym);
      return;
    }
  }
  if (kind === "income") {
    // A payday a schedule added and the user then removed stays removed.
    const made = db.prepare("SELECT schedule_id AS scheduleId, date FROM incomes WHERE id = ?").get(id) as { scheduleId: number | null; date: string } | undefined;
    if (made?.scheduleId != null) db.prepare("INSERT OR IGNORE INTO schedule_skips (schedule_id, date) VALUES (?, ?)").run(made.scheduleId, made.date);
  }
  db.prepare(`DELETE FROM ${TABLES[kind].table} WHERE id = ?`).run(id);
}

/** Which space owns a row, so an action can check the id belongs to the page it came from. */
export function rowSpace(db: Db, kind: RowKind, id: number): number | undefined {
  const row = db
    .prepare(
      `SELECT m.space_id AS spaceId FROM ${TABLES[kind].table} r JOIN months m ON m.id = r.month_id WHERE r.id = ?`,
    )
    .get(id) as { spaceId: number } | undefined;
  return row?.spaceId;
}


/** One change applied to many rows: delete them, or set the same fields on each. */
export type BulkOp = { type: "delete" } | { type: "set"; values: RowValues };

/**
 * Apply a change to several rows at once. Ids that do not belong to the space are skipped, and an
 * account is only set on a row when it is one of that row's own month's accounts. Returns how many rows changed.
 */
export function bulkRows(db: Db, spaceId: number, kind: RowKind, ids: number[], op: BulkOp): number {
  let changed = 0;
  for (const id of new Set(ids)) {
    if (rowSpace(db, kind, id) !== spaceId) continue;
    if (op.type === "delete") deleteRow(db, kind, id);
    else {
      const bank = op.values.bankId;
      if (typeof bank === "number") {
        const month = rowMonth(db, kind, id);
        if (month === undefined || !bankInMonth(db, bank, month)) continue;
      }
      updateRow(db, kind, id, op.values);
    }
    changed++;
  }
  return changed;
}

/* ---------- income schedules (per space) ---------- */

export const SCHEDULE_COLUMNS: Record<string, string> = {
  label: "label",
  amount: "amount",
  frequency: "frequency",
  anchor: "anchor",
  account: "account",
};

export function listSchedules(db: Db, spaceId: number): ScheduleRow[] {
  return db
    .prepare("SELECT id, label, amount, frequency, anchor, account FROM income_schedules WHERE space_id = ? ORDER BY id")
    .all(spaceId)
    .map((r) => ({ ...r })) as unknown as ScheduleRow[];
}

export function addSchedule(db: Db, spaceId: number, values: Partial<Omit<ScheduleRow, "id">> & { anchor: string }): number {
  const res = db
    .prepare("INSERT INTO income_schedules (space_id, label, amount, frequency, anchor, account) VALUES (?, ?, ?, ?, ?, ?)")
    .run(spaceId, values.label ?? "", values.amount ?? 0, values.frequency ?? "biweekly", values.anchor, values.account ?? "");
  return Number(res.lastInsertRowid);
}

/**
 * Change a schedule. Changing when it pays or how much (its repeat, a payday or its amount) starts it afresh: the
 * paydays that were removed by hand are forgotten, so the new settings fill in again. A new name or account does not.
 */
export function updateSchedule(db: Db, id: number, values: RowValues): void {
  const before = db.prepare("SELECT frequency, anchor, amount FROM income_schedules WHERE id = ?").get(id) as { frequency: string; anchor: string; amount: number } | undefined;
  if (before && (["frequency", "anchor", "amount"] as const).some((k) => k in values && values[k] !== before[k])) {
    db.prepare("DELETE FROM schedule_skips WHERE schedule_id = ?").run(id);
  }
  const entries = Object.entries(values).flatMap(([k, v]) => (k in SCHEDULE_COLUMNS ? [[SCHEDULE_COLUMNS[k], v] as const] : []));
  if (entries.length === 0) return;
  db.prepare(`UPDATE income_schedules SET ${entries.map(([c]) => `${c} = ?`).join(", ")} WHERE id = ?`).run(
    ...entries.map(([, v]) => v),
    id,
  );
}

/** Deleting a schedule takes back the paydays it added that have not arrived. Received ones stay. */
export function deleteSchedule(db: Db, id: number): void {
  db.prepare("DELETE FROM incomes WHERE schedule_id = ? AND status = 'Pending'").run(id);
  db.prepare("DELETE FROM income_schedules WHERE id = ?").run(id);
}

/** Like bulkRows, for income schedules. */
export function bulkSchedules(db: Db, spaceId: number, ids: number[], op: BulkOp): number {
  let changed = 0;
  for (const id of new Set(ids)) {
    if (scheduleSpace(db, id) !== spaceId) continue;
    if (op.type === "delete") deleteSchedule(db, id);
    else updateSchedule(db, id, op.values);
    changed++;
  }
  return changed;
}

export function scheduleSpace(db: Db, id: number): number | undefined {
  const row = db.prepare("SELECT space_id AS spaceId FROM income_schedules WHERE id = ?").get(id) as
    | { spaceId: number }
    | undefined;
  return row?.spaceId;
}

/**
 * Keep a month's income in step with the schedules. Safe to run any number of times.
 *  - A payday that already has a row from its schedule is left alone, even if the row was edited.
 *  - A hand-entered row on a payday with the same amount or the same label is taken over by the schedule
 *    (linked, not duplicated).
 *  - A payday the user deleted stays deleted.
 *  - Anything else gets a new Pending row.
 * With `refresh` (a schedule was just changed) the still-Pending rows of a schedule also follow its new name, amount and
 * account, and Pending rows left on dates the schedule no longer has are removed, so no stale payday keeps
 * counting toward what carries forward. Returns how many rows were added.
 */
export function applySchedules(db: Db, spaceId: number, monthId: number, ym: string, options: { refresh?: boolean } = {}): number {
  const all = listSchedules(db, spaceId);
  // A schedule with no amount (just added, still being filled in, or set to nothing) adds nothing. When one is
  // changed to no amount, it takes back its Pending paydays, as deleting it would.
  if (options.refresh) {
    const dropPending = db.prepare("DELETE FROM incomes WHERE month_id = ? AND schedule_id = ? AND status = 'Pending'");
    for (const s of all) if (s.amount <= 0) dropPending.run(monthId, s.id);
  }
  const schedules = all.filter((s) => s.amount > 0);
  if (schedules.length === 0) return 0;
  const banks = loadMonth(db, monthId).banks;
  const bankByName = (name: string) => (name ? (banks.find((b) => b.name.trim().toLowerCase() === name.trim().toLowerCase())?.id ?? null) : null);
  const norm = (t: string) => t.trim().toLowerCase();
  const ownRow = db.prepare("SELECT id, status FROM incomes WHERE month_id = ? AND schedule_id = ? AND date = ?");
  const handRows = db.prepare("SELECT id, label, amount FROM incomes WHERE month_id = ? AND schedule_id IS NULL AND date = ? ORDER BY id");
  const skipped = db.prepare("SELECT 1 FROM schedule_skips WHERE schedule_id = ? AND date = ?");
  const link = db.prepare("UPDATE incomes SET schedule_id = ? WHERE id = ?");
  const follow = db.prepare("UPDATE incomes SET label = COALESCE(NULLIF(?, ''), label), amount = ?, bank_id = ? WHERE id = ?");
  const add = db.prepare("INSERT INTO incomes (month_id, label, date, amount, status, schedule_id, bank_id) VALUES (?, ?, ?, ?, 'Pending', ?, ?)");
  const pendingOwn = db.prepare("SELECT id, date FROM incomes WHERE month_id = ? AND schedule_id = ? AND status = 'Pending'");
  const drop = db.prepare("DELETE FROM incomes WHERE id = ?");
  const taken = new Set<number>();
  let added = 0;
  for (const sch of schedules) {
    const bankId = bankByName(sch.account);
    const dates = scheduleDates(sch.frequency, sch.anchor, ym);
    for (const date of dates) {
      const own = ownRow.get(monthId, sch.id, date) as { id: number; status: string } | undefined;
      if (own) {
        if (options.refresh && own.status === "Pending") follow.run(sch.label, sch.amount, bankId, own.id);
        continue;
      }
      const hand = (handRows.all(monthId, date) as { id: number; label: string; amount: number }[]).find(
        (r) => !taken.has(r.id) && (r.amount === sch.amount || (norm(r.label) !== "" && norm(r.label) === norm(sch.label))),
      );
      if (hand) {
        taken.add(hand.id);
        link.run(sch.id, hand.id);
        continue;
      }
      if (skipped.get(sch.id, date)) continue;
      add.run(monthId, sch.label, date, sch.amount, sch.id, bankId);
      added++;
    }
    if (options.refresh) {
      for (const r of pendingOwn.all(monthId, sch.id) as { id: number; date: string }[]) if (!dates.includes(r.date)) drop.run(r.id);
    }
  }
  return added;
}

/** After a schedule changes: bring the month being viewed and every later month into step with it. */
export function syncSchedules(db: Db, spaceId: number, fromYm: string): void {
  const months = db.prepare("SELECT id, ym FROM months WHERE space_id = ? AND ym >= ? ORDER BY ym").all(spaceId, fromYm) as { id: number; ym: string }[];
  for (const m of months) applySchedules(db, spaceId, m.id, m.ym, { refresh: true });
}

/* ---------- import ---------- */

export type ImportOutcome = "added" | "replaced" | "skipped";

/** An Adjustment entry that keeps an existing month's balances as they were when months are added before it. */
export interface Bridge {
  /** The month that holds the entry: the one just before the month it protects. */
  ym: string;
  /** The month whose balances it protects. */
  protects: string;
  account: string;
  /** Positive is added as income, negative as a one-off. Zero when only an override was needed. */
  amount: Cents;
  /**
   * Also set as an override on that month's account (not an entry), when the months being added carry
   * overrides of their own: the entry keeps the trend balances, the override keeps the shown ones.
   */
  override: Cents;
}

export interface ImportReport {
  outcomes: { ym: string; outcome: ImportOutcome }[];
  bridges: Bridge[];
}

/** Store one month read from a workbook or backup. See importMonths. */
export function importMonth(
  db: Db,
  spaceId: number,
  month: ImportedMonth,
  replace: boolean,
  options: { defaultToFirstAccount?: boolean } = {},
): ImportOutcome {
  return importMonths(db, spaceId, [month], replace, options).outcomes[0].outcome;
}

/** True when `ym` comes before every other month of the book. */
function startsBeforeAll(db: Db, spaceId: number, ym: string): boolean {
  const first = db.prepare("SELECT MIN(ym) AS ym FROM months WHERE space_id = ? AND ym != ?").get(spaceId, ym) as { ym: string | null };
  return first.ym !== null && ym < first.ym;
}

const bankKey = (name: string) => name.trim().toLowerCase();

/** Each account of a month named so it can be found again: its name, and its place among same-named ones. */
function accountKeys(banks: { name: string }[]): string[] {
  const seen = new Map<string, number>();
  return banks.map((b) => {
    const k = bankKey(b.name);
    const n = seen.get(k) ?? 0;
    seen.set(k, n + 1);
    return `${k}#${n}`;
  });
}

/** Where a month opens for an account: as shown, and without admin overrides (what trends use). */
interface Opening {
  shown: Cents;
  plain: Cents;
}

/** Where every month of a book opens, by month and account. */
function openingsOf(db: Db, spaceId: number): Map<string, Map<string, Opening>> {
  const months = db.prepare("SELECT id, ym FROM months WHERE space_id = ? ORDER BY ym").all(spaceId) as { id: number; ym: string }[];
  const raw = months.map((m) => loadMonthRaw(db, m.id));
  const shown = carryBalances(raw.map(ledgerMonth));
  const plain = carryBalances(raw.map(plainLedger));
  return new Map(
    months.map((m, i) => {
      const keys = accountKeys(raw[i].banks);
      return [m.ym, new Map(shown[i].map((l, j) => [keys[j], { shown: l.opening, plain: plain[i][j].opening }] as const))] as const;
    }),
  );
}

/**
 * Months added to a book must not change the figures of the months that were already there. A month
 * opens with what the one before it projected, so a month put in front of an existing one would
 * change that one's balances. Each month that was there before, and now follows a new month,
 * gets its old opening back like this:
 *  - the account runs on from the new month: an "Adjustment" entry in that new month (income for a
 *    rise, a one-off for a fall) makes its closing equal the opening the existing month had, both as
 *    shown and as trends see it (without overrides; if the new months carry overrides of their own, a
 *    matching override covers the difference);
 *  - the account has no earlier month now: its typed opening is set to what it was.
 * Nothing in an existing month is edited, so its entries and any admin override stay as they were.
 */
function keepOpenings(db: Db, spaceId: number, before: Map<string, Map<string, Opening>>, touched: Set<string>): Bridge[] {
  const bridges: Bridge[] = [];
  const months = () => db.prepare("SELECT id, ym FROM months WHERE space_id = ? ORDER BY ym").all(spaceId) as { id: number; ym: string }[];
  // Fixing one month moves the figures after it, so look again from the next month on.
  let from = 1;
  for (let guard = 0; guard < 100000; guard++) {
    const list = months();
    const raw = list.map((m) => loadMonthRaw(db, m.id));
    const shown = carryBalances(raw.map(ledgerMonth));
    const plain = carryBalances(raw.map(plainLedger));
    let fixed = false;
    for (let i = Math.max(from, 1); i < list.length && !fixed; i++) {
      const want = before.get(list[i].ym);
      if (!want || touched.has(list[i].ym) || !touched.has(list[i - 1].ym)) continue;
      const keys = accountKeys(raw[i].banks);
      const prevKeys = accountKeys(raw[i - 1].banks);
      for (let j = 0; j < shown[i].length; j++) {
        const line = shown[i][j];
        const target = want.get(keys[j]);
        if (target === undefined || (target.shown === line.opening && target.plain === plain[i][j].opening)) continue;
        if (!line.carried) {
          db.prepare("UPDATE banks SET balance = balance + ? WHERE id = ?").run(target.shown - line.opening, line.id);
          fixed = true;
          continue;
        }
        const at = prevKeys.indexOf(keys[j]);
        if (at < 0) continue;
        const prev = raw[i - 1].banks[at];
        const ym = list[i - 1].ym;
        // The entry puts the trend balance right (overrides left out); an override covers what is left of the shown one.
        const entry = target.plain - plain[i][j].opening;
        const override = target.shown - line.opening - entry;
        if (entry > 0) db.prepare("INSERT INTO incomes (month_id, label, date, amount, status, bank_id) VALUES (?, 'Adjustment', ?, ?, 'Received', ?)").run(list[i - 1].id, monthEnd(ym), entry, prev.id);
        else if (entry < 0) db.prepare("INSERT INTO adhoc (month_id, name, status, projected, tag, bank_id) VALUES (?, 'Adjustment', 'Paid', ?, 'Adjustment', ?)").run(list[i - 1].id, -entry, prev.id);
        if (override !== 0) db.prepare("UPDATE banks SET adjust = adjust + ? WHERE id = ?").run(override, prev.id);
        bridges.push({ ym, protects: list[i].ym, account: raw[i].banks[j].name, amount: entry, override });
        fixed = true;
      }
      if (fixed) from = i + 1;
    }
    if (!fixed) break;
  }
  return bridges;
}

/**
 * Store months read from workbooks or backups, oldest first, in one step: all of them or none. An
 * existing month is left alone unless `replace` is set, in which case it is deleted and rebuilt.
 *
 * Account balances carry from month to month, so months added before (or between) existing ones would
 * change the balances of the months after them. They do not: see keepOpenings. Sheet months take
 * their typed bank balances (reconcileMonth); backup months are stored as they were. With `dryRun`
 * the whole thing is worked out and then undone, so a preview shows exactly what an import would do.
 */
export function importMonths(
  db: Db,
  spaceId: number,
  months: ImportedMonth[],
  replace: boolean,
  options: { defaultToFirstAccount?: boolean; dryRun?: boolean } = {},
): ImportReport {
  const sorted = [...months].sort((a, b) => a.ym.localeCompare(b.ym));
  const outcomes: ImportReport["outcomes"] = [];
  const bridges: Bridge[] = [];

  db.exec("BEGIN");
  try {
    const before = openingsOf(db, spaceId);
    const touched = new Set<string>();
    for (const month of sorted) {
      const existing = findMonthId(db, spaceId, month.ym);
      if (existing !== undefined && !replace) {
        outcomes.push({ ym: month.ym, outcome: "skipped" });
        continue;
      }
      insertMonth(db, spaceId, month, existing, options);
      touched.add(month.ym);
      outcomes.push({ ym: month.ym, outcome: existing !== undefined ? "replaced" : "added" });
    }
    if (touched.size > 0) bridges.push(...keepOpenings(db, spaceId, before, touched));
    db.exec(options.dryRun ? "ROLLBACK" : "COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  return { outcomes, bridges };
}

function insertMonth(db: Db, spaceId: number, month: ImportedMonth, existing: number | undefined, options: { defaultToFirstAccount?: boolean }): void {
  if (existing !== undefined) db.prepare("DELETE FROM months WHERE id = ?").run(existing);
  const monthId = Number(db.prepare("INSERT INTO months (space_id, ym) VALUES (?, ?)").run(spaceId, month.ym).lastInsertRowid);

  const bank = db.prepare("INSERT INTO banks (month_id, name, kind, balance, adjust, sort) VALUES (?, ?, ?, ?, ?, ?)");
  const bankIds = month.banks.map((b, i) => Number(bank.run(monthId, b.name, b.kind, b.balance, b.adjust ?? 0, i).lastInsertRowid));
  // Accounts are matched by name (any case), or by position for a backup. A sheet with no account
  // column can be given the first account.
  const accountId = (row: { account: string; accountAt?: number | null }): number | null => {
    if (row.accountAt !== undefined) return row.accountAt === null ? null : (bankIds[row.accountAt] ?? null);
    const name = row.account;
    const at = name ? month.banks.findIndex((b) => bankKey(b.name) === bankKey(name)) : -1;
    if (at >= 0) return bankIds[at];
    return !name && options.defaultToFirstAccount && bankIds.length > 0 ? bankIds[0] : null;
  };

  const bill = db.prepare(
    `INSERT INTO bills (month_id, name, status, projected, start_balance, interest, notes, due_day, scheduled_day, sort, bank_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  month.bills.forEach((b, i) => bill.run(monthId, b.name, b.status, b.projected, b.startBalance, b.interest, b.notes, b.dueDay, b.scheduledDay, i, accountId(b)));

  const adhoc = db.prepare("INSERT INTO adhoc (month_id, name, status, projected, tag, linked_to, notes, bank_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  for (const a of month.adHoc) adhoc.run(monthId, a.name, a.status, a.projected, a.tag, a.linkedTo, a.notes, accountId(a));

  const income = db.prepare("INSERT INTO incomes (month_id, label, date, amount, status, bank_id) VALUES (?, ?, ?, ?, ?, ?)");
  for (const i of month.incomes) income.run(monthId, i.label, i.date, i.amount, i.status, accountId(i));
  if (!month.exact) reconcileMonth(db, monthId);
}

/* ---------- account links ---------- */

/** The month a row belongs to. */
export function rowMonth(db: Db, kind: RowKind, id: number): number | undefined {
  const row = db.prepare(`SELECT month_id AS monthId FROM ${TABLES[kind].table} WHERE id = ?`).get(id) as
    | { monthId: number }
    | undefined;
  return row?.monthId;
}

/** True if the bank row belongs to the month, so a row cannot point at another month's account. */
export function bankInMonth(db: Db, bankId: number, monthId: number): boolean {
  return !!db.prepare("SELECT 1 FROM banks WHERE id = ? AND month_id = ?").get(bankId, monthId);
}

/**
 * Make a month's balances equal the ones typed into its account rows (the sheet's bank figure, which
 * does not have Payment Made taken off). An account's first month takes the figure as its opening
 * balance; later months are brought to it with an "Adjustment" entry (income for a rise, a one-off
 * for a fall), so the typed figure stands and the change shows up as an entry. For importing sheets
 * and for converting books made before balances carried.
 */
export function reconcileMonth(db: Db, monthId: number): void {
  const info = db.prepare("SELECT space_id AS spaceId, ym FROM months WHERE id = ?").get(monthId) as { spaceId: number; ym: string } | undefined;
  if (!info) return;
  const ids = db.prepare("SELECT id FROM months WHERE space_id = ? AND ym <= ? ORDER BY ym").all(info.spaceId, info.ym) as { id: number }[];
  const raw = ids.map((m) => loadMonthRaw(db, m.id));
  const here = raw[raw.length - 1];
  const targets = new Map(
    here.banks.map((b) => {
      const made = [...here.bills, ...here.adHoc].filter((p) => p.bankId === b.id && p.status === "Payment Made").reduce((a, p) => a + p.projected, 0);
      return [b.id, b.balance - made] as const;
    }),
  );
  for (const line of carryBalances(raw.map(ledgerMonth))[raw.length - 1]) {
    const gap = (targets.get(line.id) ?? 0) - line.balance;
    if (gap === 0) continue;
    if (!line.carried) db.prepare("UPDATE banks SET balance = balance + ? WHERE id = ?").run(gap, line.id);
    else if (gap > 0)
      db.prepare("INSERT INTO incomes (month_id, label, date, amount, status, bank_id) VALUES (?, 'Adjustment', ?, ?, 'Received', ?)").run(monthId, monthStart(info.ym), gap, line.id);
    else db.prepare("INSERT INTO adhoc (month_id, name, status, projected, tag, bank_id) VALUES (?, 'Adjustment', 'Paid', ?, 'Adjustment', ?)").run(monthId, -gap, line.id);
  }
}

/**
 * Convert a book made before balances carried. The latest month up to `todayYm` keeps its typed
 * balances (net of Payment Made) as they are; each account's opening is set in its first month so
 * the carry lands exactly on them. No entries are added. Earlier months show whatever follows from
 * their entries. An account that is not in that month keeps its typed balance as its opening.
 */
export function anchorSpace(db: Db, spaceId: number, todayYm: string): void {
  const months = db.prepare("SELECT id, ym FROM months WHERE space_id = ? ORDER BY ym").all(spaceId) as { id: number; ym: string }[];
  if (months.length === 0) return;
  const upTo = months.filter((m) => m.ym <= todayYm);
  const at = months.indexOf(upTo[upTo.length - 1] ?? months[0]);
  const raw = months.slice(0, at + 1).map((m) => loadMonthRaw(db, m.id));
  const here = raw[at];
  const key = (n: string) => n.trim().toLowerCase();
  // With every opening at zero, what each account would hold at the anchor month.
  const zeroed = raw.map((r) => ({ ...r, banks: r.banks.map((b) => ({ ...b, balance: 0 })) }));
  const derived = carryBalances(zeroed.map(ledgerMonth))[at];
  for (const b of here.banks) {
    const made = [...here.bills, ...here.adHoc].filter((p) => p.bankId === b.id && p.status === "Payment Made").reduce((a, p) => a + p.projected, 0);
    const want = b.balance - made;
    const have = derived.find((l) => l.id === b.id)?.balance ?? 0;
    const first = raw.findIndex((r) => r.banks.some((x) => key(x.name) === key(b.name)));
    const row = raw[first].banks.find((x) => key(x.name) === key(b.name))!;
    db.prepare("UPDATE banks SET balance = ? WHERE id = ?").run(want - have, row.id);
  }
}

/**
 * Admin override: set an account's balance in a month to `target` without adding an entry. The
 * difference is kept on the account (`adjust`), so later entries still move the balance from there
 * and later months carry it on. Returns the difference in cents (0 when nothing needed to change).
 */
export function overrideBalance(db: Db, monthId: number, bankId: number, target: Cents): Cents {
  const bank = loadMonth(db, monthId).banks.find((b) => b.id === bankId);
  if (!bank) return 0;
  const gap = target - bank.balance;
  if (gap !== 0) db.prepare("UPDATE banks SET adjust = adjust + ? WHERE id = ?").run(gap, bankId);
  return gap;
}

/**
 * Admin override, in the bank's own terms: set an account to `target`, the figure the bank shows, which still
 * counts payments marked Payment Made (they have been sent but have not left yet). The account's balance
 * here is net of those, so they come off before the difference is kept. The cushion then takes them off once.
 */
export function overrideBankFigure(db: Db, monthId: number, bankId: number, target: Cents): Cents {
  const bank = loadMonth(db, monthId).banks.find((b) => b.id === bankId);
  return bank ? overrideBalance(db, monthId, bankId, target - bank.made) : 0;
}
