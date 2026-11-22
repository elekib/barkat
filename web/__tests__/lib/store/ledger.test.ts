import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { migrate, openDb } from "@/lib/db";
import { migrations } from "@/lib/db/migrations";
import { addRow, createMonth, createSpace, deleteRow, loadMonth, overrideBalance, updateRow } from "@/lib/store";

const c = (d: number) => d * 100;

describe("balances carry between months", () => {
  it("opens a new month with what the last one projected, and moves only by entries", () => {
    const db = openDb(":memory:");
    const space = createSpace(db, "Home");
    const jan = createMonth(db, space, "2026-01");
    const acct = addRow(db, "bank", jan, { name: "Checking", balance: c(1000) });
    addRow(db, "income", jan, { label: "Pay", date: "2026-01-05", amount: c(500), status: "Received", bankId: acct });
    addRow(db, "bill", jan, { name: "Rent", status: "Pending", projected: c(300), bankId: acct });

    expect(loadMonth(db, jan).banks[0]).toMatchObject({ balance: c(1500), opening: c(1000), carried: false });

    const feb = createMonth(db, space, "2026-02");
    const [bank] = loadMonth(db, feb).banks;
    expect(bank).toMatchObject({ opening: c(1200), balance: c(1200), carried: true });

    // The typed value in a carried month does not matter: the balance is derived.
    updateRow(db, "bank", bank.id, { balance: c(99999) });
    expect(loadMonth(db, feb).banks[0].balance).toBe(c(1200));

    // A change to the January bill flows through.
    updateRow(db, "bill", loadMonth(db, jan).bills[0].id, { status: "Paid" });
    expect(loadMonth(db, jan).banks[0].balance).toBe(c(1200));
    expect(loadMonth(db, feb).banks[0].opening).toBe(c(1200));
  });

  it("counts Payment Made as already out of the account", () => {
    const db = openDb(":memory:");
    const space = createSpace(db, "Home");
    const m = createMonth(db, space, "2026-01");
    const acct = addRow(db, "bank", m, { name: "Checking", balance: c(1000) });
    addRow(db, "bill", m, { name: "Card", status: "Payment Made", projected: c(250), bankId: acct });
    expect(loadMonth(db, m).banks[0]).toMatchObject({ balance: c(750), made: c(250) });
  });

  it("renames only that account when two in a month share a name", () => {
    const db = openDb(":memory:");
    const space = createSpace(db, "Home");
    const jan = createMonth(db, space, "2026-01");
    const a = addRow(db, "bank", jan, { name: "Santander", balance: 0 });
    addRow(db, "bank", jan, { name: "Santander", balance: 0 });
    const feb = createMonth(db, space, "2026-02");
    updateRow(db, "bank", a, { name: "Santander - Checking" });
    expect(loadMonth(db, jan).banks.map((b) => b.name)).toEqual(["Santander - Checking", "Santander"]);
    expect(loadMonth(db, feb).banks.map((b) => b.name)).toEqual(["Santander - Checking", "Santander"]);
    // Saving the second under the same name afterwards does not touch the first.
    updateRow(db, "bank", loadMonth(db, jan).banks[1].id, { name: "Santander - Saving" });
    expect(loadMonth(db, jan).banks.map((b) => b.name)).toEqual(["Santander - Checking", "Santander - Saving"]);
    expect(loadMonth(db, feb).banks.map((b) => b.name)).toEqual(["Santander - Checking", "Santander - Saving"]);
  });

  it("adds, renames and deletes an account across the later months", () => {
    const db = openDb(":memory:");
    const space = createSpace(db, "Home");
    const jan = createMonth(db, space, "2026-01");
    const feb = createMonth(db, space, "2026-02");
    const id = addRow(db, "bank", jan, { name: "Savings", balance: c(10) });
    expect(loadMonth(db, feb).banks.map((b) => b.name)).toEqual(["Savings"]);
    expect(loadMonth(db, feb).banks[0].balance).toBe(c(10));

    updateRow(db, "bank", id, { name: "Rainy day" });
    expect(loadMonth(db, feb).banks.map((b) => b.name)).toEqual(["Rainy day"]);

    deleteRow(db, "bank", id);
    expect(loadMonth(db, jan).banks).toEqual([]);
    expect(loadMonth(db, feb).banks).toEqual([]);
  });
});

describe("overrideBalance", () => {
  it("sets a balance without adding entries, and later entries and months carry on from it", () => {
    const db = openDb(":memory:");
    const space = createSpace(db, "Home");
    const jan = createMonth(db, space, "2026-01");
    const acct = addRow(db, "bank", jan, { name: "Checking", balance: c(100) });
    expect(overrideBalance(db, jan, acct, c(150))).toBe(c(50));
    expect(loadMonth(db, jan).banks[0].balance).toBe(c(150));
    expect(loadMonth(db, jan).incomes).toEqual([]);
    expect(overrideBalance(db, jan, acct, c(150))).toBe(0);
    // The override is not part of trends.
    expect(loadMonth(db, jan).banks[0]).toMatchObject({ balance: c(150), organic: c(100) });

    // An income marked Received still moves it from the overridden figure.
    addRow(db, "income", jan, { label: "Pay", date: "2026-01-05", amount: c(20), status: "Received", bankId: acct });
    expect(loadMonth(db, jan).banks[0].balance).toBe(c(170));
    // The next month opens from it.
    const feb = createMonth(db, space, "2026-02");
    expect(loadMonth(db, feb).banks[0]).toMatchObject({ opening: c(170), balance: c(170), organic: c(120) });
  });
});

describe("migration to balances that carry", () => {
  it("lands the latest typed balance by setting the first opening, with no adjustments", () => {
    const db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON");
    db.exec("CREATE TABLE schema_version (version INTEGER PRIMARY KEY)");
    for (const m of migrations.filter((x) => x.version <= 4)) {
      db.exec(m.sql);
      db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(m.version);
    }
    db.exec("INSERT INTO spaces (id, name) VALUES (1, 'Home')");
    db.exec("INSERT INTO months (id, space_id, ym) VALUES (1, 1, '2026-01'), (2, 1, '2026-02')");
    // January: sheet bank 1000, one payment made of 100 (so 900 in the account).
    db.exec("INSERT INTO banks (id, month_id, name, kind, balance, sort) VALUES (1, 1, 'Checking', '', 100000, 0), (2, 2, 'checking', '', 70000, 0)");
    db.exec("INSERT INTO bills (month_id, name, status, projected, start_balance, bank_id) VALUES (1, 'Card', 'Payment Made', 10000, 0, 1)");
    migrate(db);

    // Last month on or before today is February: its typed 700 is kept, so January opens at 900 + ... backwards.
    // January carries 900 into February (1000 opening less 100 sent), so the opening is set to 800.
    const feb = db.prepare("SELECT id FROM months WHERE ym = '2026-02'").get() as { id: number };
    const jan = db.prepare("SELECT id FROM months WHERE ym = '2026-01'").get() as { id: number };
    expect(loadMonth(db, feb.id).banks[0].balance).toBe(c(700));
    expect(loadMonth(db, jan.id).banks[0]).toMatchObject({ opening: c(800), carried: false });
    expect(db.prepare("SELECT COUNT(*) AS n FROM adhoc").get()).toMatchObject({ n: 0 });
  });
});
