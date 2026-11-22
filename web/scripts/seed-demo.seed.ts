/**
 * Demo data for trying and testing Barkat: made-up books with monthly history from January 2018 up to the
 * current month. Nothing here is real. Run it with `npm run seed:demo` (see README).
 *
 * It writes to its own database, `web/data-demo/barkat.db` (or BARKAT_DATA_DIR), never to `web/data`.
 * An existing demo database keeps its books unless SEED_RESET=1. It also makes two fixed demo users (below), if
 * they are missing, so nobody has to run the setup screen: start Barkat on that data
 * (`BARKAT_DATA_DIR=data-demo npm run dev`) and sign in. These logins are public on purpose and only for the
 * demo database: never use them, or this database, anywhere other people can reach.
 */
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { it } from "vitest";
import { currentYm, shiftYm } from "@/lib/budget/months";
import { Accounts } from "@/lib/auth/accounts";
import { createAuth } from "@/lib/auth/auth";
import { openDb } from "@/lib/db";
import type { ImportedMonth } from "@/lib/excel/read";
import { addSchedule, createSpace, findMonthId, importMonths, listMonths, loadMonth, overrideBalance } from "@/lib/store";

const START = "2018-01";

/** Fixed demo logins. The same password for both, so testing never needs a setup or a password change. */
export const DEMO_PASSWORD = "Barkat-Sandbox-2026";
const DEMO_USERS = [
  { username: "demo", role: "admin" as const },
  { username: "viewer", role: "viewer" as const },
];
const cents = (dollars: number) => Math.round(dollars * 100);

/** A small fixed-seed random generator, so every run makes the same demo. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

interface Book {
  name: string;
  /** Scales every amount, so a second book can be smaller. */
  scale: number;
  from: string;
  seed: number;
  /** Credit card appears from this month. */
  cardFrom: string;
}

/** The months of one book, oldest first, in the shape the importer takes. Balances are typed only in an account's first month. */
function history(book: Book, now: string): ImportedMonth[] {
  const rand = rng(book.seed);
  const today = new Date();
  const todayIso = iso(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const months: ImportedMonth[] = [];
  const seen = new Set<string>();
  // Paydays every second Friday from the first Friday of 2018.
  let pay = Date.UTC(2018, 0, 5);
  const day = 86_400_000;

  for (let ym = book.from; ym <= now; ym = shiftYm(ym, 1)) {
    const [y, m] = ym.split("-").map(Number);
    const grow = (rate: number) => (1 + rate) ** (y - 2018);
    const isNow = ym === now;
    const bill = (name: string, base: number, dueDay: number, status: "Paid" | "Pending" | "Payment Made") => ({
      name,
      status,
      projected: cents(base * book.scale),
      startBalance: 0,
      interest: "",
      notes: "",
      dueDay,
      scheduledDay: null,
      account: "Checking",
    });
    const settled = (dueDay: number) => (!isNow || dueDay < today.getDate() ? ("Paid" as const) : ("Pending" as const));
    const season = Math.cos(((m - 1) / 12) * 2 * Math.PI); // winter high, summer low

    const bills = [
      bill("Rent", 1100 * grow(0.045), 1, settled(1)),
      bill("Electricity", 95 * grow(0.04) * (1 + 0.35 * season) * (0.92 + rand() * 0.16), 15, settled(15)),
      bill("Internet", 45 * grow(0.03), 10, settled(10)),
      bill("Phone", 32 * grow(0.03), 20, settled(20)),
      bill("Car insurance", 88 * grow(0.05), 5, settled(5)),
      bill("Groceries", 420 * grow(0.04) * (0.92 + rand() * 0.16), 25, settled(25)),
      bill("Fuel and transit", 160 * grow(0.03) * (0.9 + rand() * 0.2), 12, settled(12)),
    ];
    if (ym >= "2019-03") bills.push(bill("Gym", 26 * grow(0.02), 3, settled(3)));
    if (ym >= "2020-05") bills.push(bill("Streaming", 13 * grow(0.04), 8, settled(8)));
    if (ym >= book.cardFrom) {
      const due = 22;
      const status = !isNow || due < today.getDate() ? "Paid" : today.getDate() >= 18 ? "Payment Made" : "Pending";
      bills.push({ ...bill("Credit card", 260 * grow(0.03) * (0.6 + rand() * 0.9), due, status), account: "Checking", notes: "Pay in full" });
    }

    const adHoc: ImportedMonth["adHoc"] = [];
    const oneOff = (name: string, amount: number, tag: string, account = "Checking") =>
      adHoc.push({ name, status: "Paid", projected: cents(amount * book.scale), tag, linkedTo: "", notes: "", account });
    if (m === 4) oneOff("Zakat", 700 * grow(0.08), "Charity");
    if (m === 8) oneOff("Summer trip", 650 * grow(0.04) * (0.8 + rand() * 0.5), "Travel");
    if (m === 12) oneOff("Gifts", 320 * grow(0.04), "Gifts");
    if (m === 6 && y % 2 === 0) oneOff("Car service", 380 * grow(0.04), "Car");
    if (rand() < 0.08) oneOff("Dentist", 120 + Math.round(rand() * 280), "Health");
    if (rand() < 0.05) oneOff("Appliance repair", 90 + Math.round(rand() * 250), "Home", "Savings");

    // Paychecks falling in this month.
    const incomes: ImportedMonth["incomes"] = [];
    while (iso(pay).slice(0, 7) < ym) pay += 14 * day;
    for (; iso(pay).slice(0, 7) === ym; pay += 14 * day) {
      const date = iso(pay);
      incomes.push({ label: "Paycheck", date, amount: cents(1230 * grow(0.035) * book.scale), status: date <= todayIso ? "Received" : "Pending", account: "Checking" });
    }
    if (m === 3) incomes.push({ label: "Tax refund", date: `${ym}-18`, amount: cents((380 + Math.round(rand() * 420)) * book.scale), status: "Received", account: "Checking" });
    if (m === 12) incomes.push({ label: "Year-end bonus", date: `${ym}-19`, amount: cents(900 * grow(0.04) * book.scale), status: isNow ? "Pending" : "Received", account: "Checking" });
    incomes.push({ label: "Interest", date: `${ym}-28`, amount: cents((3 + rand() * 6 + (y - 2018) * 0.8) * book.scale), status: isNow ? "Pending" : "Received", account: "Savings" });

    const banks = [
      { name: "Checking", kind: "Checking", open: 3200 },
      { name: "Savings", kind: "Savings", open: 5200 },
      ...(ym >= book.cardFrom ? [{ name: "Credit card", kind: "Credit", open: 0 }] : []),
    ].map((b) => {
      const first = !seen.has(b.name);
      seen.add(b.name);
      // Only an account's first month holds a typed opening; later months carry from the one before.
      return { name: b.name, kind: b.kind, balance: first ? cents(b.open * book.scale) : 0 };
    });

    months.push({ ym, sheet: ym, exact: true, banks, bills, adHoc, incomes });
  }
  return months;
}

const loginNote = `Sign in as "demo" (admin) or "viewer" (read-only) with the password ${DEMO_PASSWORD}`;

/** The two fixed users, added only where missing. */
async function addDemoUsers(db: ReturnType<typeof openDb>) {
  const accounts = new Accounts(createAuth(db, { nextCookies: false }), db);
  const have = new Set((await accounts.listUsers()).map((u) => u.username));
  for (const u of DEMO_USERS) {
    if (have.has(u.username)) continue;
    const made = await accounts.createUser(u.username, DEMO_PASSWORD, u.role);
    if (!made.ok) throw new Error(`Could not create demo user ${u.username}: ${"message" in made ? made.message : made.error}`);
  }
}

it("seeds the demo database", async () => {
  const dir = path.resolve(process.env.BARKAT_DATA_DIR || "data-demo");
  if (dir === path.resolve("data")) throw new Error("Refusing to seed web/data: that is where real books live. Use another BARKAT_DATA_DIR.");
  const file = path.join(dir, "barkat.db");
  if (process.env.SEED_RESET === "1") for (const f of [file, `${file}-wal`, `${file}-shm`]) rmSync(f, { force: true });
  const db = openDb(file);
  await addDemoUsers(db);
  const have = (db.prepare("SELECT COUNT(*) AS n FROM spaces").get() as { n: number }).n;
  if (have > 0) {
    console.log(`\n${file} already has ${have} book(s). Books left alone; run with SEED_RESET=1 to start it over.\n${loginNote}\n`);
    return;
  }

  const now = currentYm();
  const books: Book[] = [
    { name: "Household", scale: 1, from: START, seed: 7, cardFrom: "2020-03" },
    { name: "Parents' accounts", scale: 0.45, from: "2021-06", seed: 23, cardFrom: "2099-01" },
  ];
  for (const book of books) {
    const space = createSpace(db, book.name);
    importMonths(db, space, history(book, now), false);
    // A payday rhythm for new months to fill from, starting at the latest payday in the book.
    const latest = loadMonth(db, findMonthId(db, space, now)!).incomes.filter((i) => i.label === "Paycheck").sort((a, b) => a.date.localeCompare(b.date)).pop();
    if (latest) addSchedule(db, space, { label: "Paycheck", amount: latest.amount, frequency: "biweekly", anchor: latest.date, account: "Checking" });
    if (book.name === "Household") {
      // One admin override in the middle of the history, so the Accounts card and trends have something to ignore.
      const id = findMonthId(db, space, "2024-06")!;
      const checking = loadMonth(db, id).banks.find((b) => b.name === "Checking")!;
      overrideBalance(db, id, checking.id, checking.balance + cents(25));
    }
    console.log(`${book.name}: ${listMonths(db, space).length} months, ${book.from} to ${now}`);
  }
  console.log(`\nDemo data written to ${file}\nStart Barkat on it:  BARKAT_DATA_DIR=${path.relative(process.cwd(), dir) || "."} npm run dev\n${loginNote}\n`);
});
