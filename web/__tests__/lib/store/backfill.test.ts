import { describe, expect, it, vi } from "vitest";

// Building years of months is slow on a busy machine.
vi.setConfig({ testTimeout: 60_000 });
import { exportBook, parseBackup } from "@/lib/backup";
import { summarize } from "@/lib/budget/summary";
import { trend } from "@/lib/budget/trend";
import { openDb, type Db } from "@/lib/db";
import { readWorkbook } from "@/lib/excel/read";
import { buildWorkbook } from "@/lib/excel/write";
import { backupMonths, planImport, type ReadFile } from "@/lib/import";
import {
  addRow,
  addSchedule,
  applySchedules,
  copyIntoMonth,
  createMonth,
  createSpace,
  findMonthId,
  importMonths,
  listMonthRows,
  listMonths,
  loadMonth,
  overrideBalance,
  updateRow,
} from "@/lib/store";

const c = (d: number) => d * 100;

/** A made-up book with eleven months of 2026: two accounts, one that appears in June, Payment Made, pending income, an override. */
function currentBook() {
  const db = openDb(":memory:");
  const space = createSpace(db, "Household");
  const jan = createMonth(db, space, "2026-01");
  const checking = addRow(db, "bank", jan, { name: "Checking", kind: "Checking", balance: c(1000) });
  addRow(db, "bank", jan, { name: "Savings", kind: "Savings", balance: c(200) });
  addRow(db, "income", jan, { label: "Pay", date: "2026-01-09", amount: c(500), status: "Received", bankId: checking });
  addRow(db, "income", jan, { label: "Bonus", date: "2026-01-23", amount: c(400), status: "Pending", bankId: checking });
  addRow(db, "bill", jan, { name: "Rent", status: "Paid", projected: c(300), dueDay: 3, bankId: checking });
  addRow(db, "bill", jan, { name: "Card", status: "Payment Made", projected: c(80), dueDay: 20, bankId: checking });
  addRow(db, "adhoc", jan, { name: "Trip", status: "Pending", projected: c(60), tag: "Travel", bankId: checking });
  for (let m = 2; m <= 11; m++) {
    const id = createMonth(db, space, `2026-${String(m).padStart(2, "0")}`);
    const bank = loadMonth(db, id).banks[0];
    for (const inc of loadMonth(db, id).incomes) updateRow(db, "income", inc.id, { status: m % 2 ? "Received" : "Pending" });
    for (const b of loadMonth(db, id).bills) updateRow(db, "bill", b.id, { status: m % 3 ? "Paid" : "Pending", bankId: bank.id });
    if (m === 3) overrideBalance(db, id, bank.id, loadMonth(db, id).banks[0].balance + c(123));
    if (m === 6) addRow(db, "bank", id, { name: "Credit", kind: "Credit", balance: c(-50) });
  }
  return { db, space };
}

/** Everything about the months of a book that the screens and trends read, without ids. */
function figures(db: Db, space: number, from = "2026-01") {
  return listMonthRows(db, space)
    .filter((m) => m.ym >= from)
    .map(({ ym, rows }) => {
      const sum = summarize({ bills: rows.bills, adHoc: rows.adHoc, incomes: rows.incomes, banks: rows.banks.map((b) => b.balance + b.made) });
      return {
        ym,
        banks: rows.banks.map((b) => ({ name: b.name, balance: b.balance, opening: b.opening, made: b.made, adjust: b.adjust, organic: b.organic })),
        cushion: sum.cushion,
        bills: rows.bills.map((b) => [b.name, b.status, b.projected]),
        incomes: rows.incomes.map((i) => [i.label, i.amount, i.status]),
        adHoc: rows.adHoc.map((a) => [a.name, a.status, a.projected]),
      };
    });
}

/** Four years of made-up months as a workbook per year, read back like uploads. */
async function oldYears(years: number[], typed: Map<string, number> = new Map()): Promise<ReadFile[]> {
  const db = openDb(":memory:");
  const space = createSpace(db, "Old");
  const first = createMonth(db, space, `${years[0]}-01`);
  const a = addRow(db, "bank", first, { name: "Checking", kind: "Checking", balance: c(2500) });
  addRow(db, "bank", first, { name: "Savings", kind: "Savings", balance: c(50) });
  addRow(db, "bill", first, { name: "Rent", status: "Paid", projected: c(250), bankId: a });
  addRow(db, "income", first, { label: "Pay", date: `${years[0]}-01-05`, amount: c(700), status: "Received", bankId: a });
  for (let i = 1; i < years.length * 12; i++) {
    const ym = `${years[0] + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
    const id = createMonth(db, space, ym);
    for (const inc of loadMonth(db, id).incomes) updateRow(db, "income", inc.id, { status: "Received", amount: c(650 + (i % 5) * 20) });
    for (const b of loadMonth(db, id).bills) updateRow(db, "bill", b.id, { status: "Paid" });
  }
  const all = listMonthRows(db, space);
  // The figure each sheet will carry for Checking: what the bank holds plus payments sent.
  for (const m of all) typed.set(m.ym, m.rows.banks[0].balance + m.rows.banks[0].made);
  const files: ReadFile[] = [];
  // Out of order on purpose: the newest year first.
  for (const y of [...years].reverse()) {
    const read = await readWorkbook(new Uint8Array(await buildWorkbook(all.filter((m) => m.ym.startsWith(`${y}-`)))), null);
    files.push({ file: `${y}.xlsx`, kind: "xlsx", ...read });
  }
  return files;
}

describe("importing old years in front of the current months", () => {
  it("keeps every current month's balances, cushion and trend exactly as they were", async () => {
    const { db, space } = currentBook();
    const before = figures(db, space);
    const trendOf = () => trend(listMonthRows(db, space).map(({ ym, rows }) => ({ ym, bills: rows.bills, adHoc: rows.adHoc, incomes: rows.incomes, banks: rows.banks.map((b) => b.organic + b.made) })));
    const trendBefore = trendOf();
    expect(before[2].banks[0].adjust).toBe(c(123)); // the March override is in the book

    const files = await oldYears([2022, 2023, 2024, 2025]);
    const plan = planImport(files, listMonths(db, space), false);
    expect(plan.rows).toHaveLength(48);
    expect(plan.rows[0].ym).toBe("2022-01");
    const report = importMonths(db, space, plan.write, false);

    expect(report.outcomes.filter((o) => o.outcome === "added")).toHaveLength(48);
    expect(listMonths(db, space)).toHaveLength(59);
    expect(figures(db, space)).toEqual(before);
    expect(trendOf().filter((p) => p.ym >= "2026-01")).toEqual(trendBefore);

    // The join is one Adjustment per account in December 2025, none inside the existing months.
    expect(report.bridges.length).toBeGreaterThan(0);
    expect(report.bridges.every((b) => b.ym === "2025-12" && b.protects === "2026-01")).toBe(true);
    const dec = loadMonth(db, findMonthId(db, space, "2025-12")!);
    expect([...dec.incomes, ...dec.adHoc].filter((r) => ("label" in r ? r.label : r.name) === "Adjustment")).toHaveLength(report.bridges.length);
    // January now opens from December instead of holding a typed opening.
    expect(loadMonth(db, findMonthId(db, space, "2026-01")!).banks[0]).toMatchObject({ carried: true, opening: c(1000) });
    // Credit began in June and never existed before, so it is untouched.
    expect(report.bridges.some((b) => b.account === "Credit")).toBe(false);
  });

  it("brings the old months in with the balances typed in their sheets", async () => {
    const { db, space } = currentBook();
    const typed = new Map<string, number>();
    const files = await oldYears([2024, 2025], typed);
    importMonths(db, space, planImport(files, listMonths(db, space), false).write, false);
    const old = loadMonth(db, findMonthId(db, space, "2024-01")!);
    expect(old.banks.map((b) => [b.name, b.carried])).toEqual([["Checking", false], ["Savings", false]]);
    // The first month holds the typed opening; every month but the last lands on its sheet's figure.
    expect(old.banks[0].opening).toBe(c(2500));
    for (const ym of ["2024-01", "2024-07", "2025-11"]) {
      const m = loadMonth(db, findMonthId(db, space, ym)!);
      expect(m.banks[0].balance + m.banks[0].made).toBe(typed.get(ym));
    }
    expect(loadMonth(db, findMonthId(db, space, "2024-07")!).banks[0].carried).toBe(true);
  });

  it("previews the same adjustments and changes nothing", async () => {
    const { db, space } = currentBook();
    const counts = () => (["months", "banks", "bills", "adhoc", "incomes"] as const).map((t) => (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n);
    const before = counts();
    const figs = figures(db, space);
    const plan = planImport(await oldYears([2025]), listMonths(db, space), false);
    const dry = importMonths(db, space, plan.write, false, { dryRun: true });
    expect(counts()).toEqual(before);
    expect(figures(db, space)).toEqual(figs);
    const real = importMonths(db, space, plan.write, false);
    expect(real.bridges).toEqual(dry.bridges);
    expect(figures(db, space)).toEqual(figs);
  });

  it("is all or nothing when a month cannot be stored", async () => {
    const { db, space } = currentBook();
    const files = await oldYears([2025]);
    const bad = { ...files[0].months[3], banks: [{ name: "x", kind: "", balance: Number.NaN }] };
    const months = [...files[0].months.slice(0, 3), bad as never];
    expect(() => importMonths(db, space, months, false)).toThrow();
    expect(listMonths(db, space)).toHaveLength(11);
  });

  it("restores months from a Barkat backup the same way: stored as they were, later months untouched", () => {
    const { db, space } = currentBook();
    const before = figures(db, space);
    // An older book with an admin override inside it.
    const old = openDb(":memory:");
    const s = createSpace(old, "Old");
    const m1 = createMonth(old, s, "2025-10");
    const acct = addRow(old, "bank", m1, { name: "Checking", balance: c(900) });
    addRow(old, "income", m1, { label: "Pay", date: "2025-10-05", amount: c(100), status: "Received", bankId: acct });
    overrideBalance(old, m1, acct, c(1111));
    createMonth(old, s, "2025-11");
    const months = backupMonths(parseBackup(JSON.stringify(exportBook(old, s))));

    importMonths(db, space, months, false);
    expect(figures(db, space)).toEqual(before);
    const oct = loadMonth(db, findMonthId(db, space, "2025-10")!);
    expect(oct.banks[0]).toMatchObject({ opening: c(900), adjust: c(111), balance: c(1111) });
    expect(oct.incomes.map((i) => i.label)).toEqual(["Pay"]);
  });

  it("keeps later months as they were when a month in the middle is replaced", async () => {
    const { db, space } = currentBook();
    const before = figures(db, space, "2026-05");
    const [file] = await oldYears([2026]);
    const may = file.months.find((m) => m.ym === "2026-04")!;
    const report = importMonths(db, space, [may], true);
    expect(report.outcomes).toEqual([{ ym: "2026-04", outcome: "replaced" }]);
    expect(figures(db, space, "2026-05")).toEqual(before);
  });

  it("leaves an admin override on an existing month exactly as it was", async () => {
    const { db, space } = currentBook();
    const mar = findMonthId(db, space, "2026-03")!;
    const adjustBefore = loadMonth(db, mar).banks.map((b) => b.adjust);
    importMonths(db, space, planImport(await oldYears([2025]), listMonths(db, space), false).write, false);
    expect(loadMonth(db, mar).banks.map((b) => b.adjust)).toEqual(adjustBefore);
    expect(adjustBefore[0]).toBe(c(123));
  });
});

describe("schedules, copying and many years", () => {
  it("schedules never reach back before their first payday, and importing does not run them", async () => {
    const { db, space } = currentBook();
    addSchedule(db, space, { label: "Pay", amount: c(500), frequency: "biweekly", anchor: "2026-01-02", account: "Checking" });
    const incomesBefore = (db.prepare("SELECT COUNT(*) AS n FROM incomes").get() as { n: number }).n;
    importMonths(db, space, planImport(await oldYears([2025]), listMonths(db, space), false).write, false);
    const imported = (db.prepare("SELECT COUNT(*) AS n FROM incomes WHERE schedule_id IS NOT NULL").get() as { n: number }).n;
    expect(imported).toBe(0);
    expect((db.prepare("SELECT COUNT(*) AS n FROM incomes").get() as { n: number }).n).toBeGreaterThan(incomesBefore);
    const old = findMonthId(db, space, "2025-06")!;
    expect(applySchedules(db, space, old, "2025-06")).toBe(0);
    expect(applySchedules(db, space, findMonthId(db, space, "2026-02")!, "2026-02")).toBeGreaterThan(0);
  });

  it("starts an older month empty, and copies into it from a later one without moving the later months", () => {
    const { db, space } = currentBook();
    const before = figures(db, space);
    const dec = createMonth(db, space, "2025-12");
    expect(loadMonth(db, dec).banks).toEqual([]);
    expect(figures(db, space)).toEqual(before);

    const nov = createMonth(db, space, "2025-11");
    const result = copyIntoMonth(db, space, nov, "2026-01", "merge");
    expect(result).toEqual({ banks: 2, bills: 2 });
    expect(figures(db, space)).toEqual(before);
    expect(loadMonth(db, nov).bills.map((b) => b.status)).toEqual(["Pending", "Pending"]);
  });

  it("starts a month after the newest from it, copying bills and carrying balances", () => {
    const { db, space } = currentBook();
    const dec = createMonth(db, space, "2026-12");
    const nov = loadMonth(db, findMonthId(db, space, "2026-11")!);
    expect(loadMonth(db, dec).banks.map((b) => b.opening)).toEqual(nov.banks.map((b) => b.balance + loadMonthClosing(db, space, b.name)));
  });

  it("loads ten years of months in one pass with the same numbers as loading each month alone", () => {
    const db = openDb(":memory:");
    const space = createSpace(db, "Long");
    const first = createMonth(db, space, "2017-01");
    const a = addRow(db, "bank", first, { name: "Checking", balance: c(100) });
    addRow(db, "income", first, { label: "Pay", date: "2017-01-05", amount: c(300), status: "Received", bankId: a });
    addRow(db, "bill", first, { name: "Rent", status: "Paid", projected: c(200), bankId: a });
    for (let i = 1; i < 120; i++) createMonth(db, space, `${2017 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`);
    const all = listMonthRows(db, space);
    expect(all).toHaveLength(120);
    for (const at of [0, 37, 119]) expect(loadMonth(db, findMonthId(db, space, all[at].ym)!)).toEqual(all[at].rows);
  });
});

/** What an account still expects in a month: income to arrive less bills to pay. */
function loadMonthClosing(db: Db, space: number, name: string): number {
  const m = loadMonth(db, findMonthId(db, space, "2026-11")!);
  const id = m.banks.find((b) => b.name === name)!.id;
  const inc = m.incomes.filter((i) => i.bankId === id && i.status === "Pending").reduce((a, i) => a + i.amount, 0);
  const out = [...m.bills, ...m.adHoc].filter((p) => p.bankId === id && p.status === "Pending").reduce((a, p) => a + p.projected, 0);
  return inc - out;
}
