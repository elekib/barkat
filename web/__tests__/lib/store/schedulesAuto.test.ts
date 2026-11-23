import { describe, expect, it } from "vitest";
import { openDb } from "@/lib/db";
import {
  addRow,
  addSchedule,
  applySchedules,
  bulkRows,
  createMonth,
  createSpace,
  deleteSchedule,
  loadMonth,
  syncSchedules,
  updateSchedule,
} from "@/lib/store";

const c = (n: number) => n * 100;

function setup() {
  const db = openDb(":memory:");
  const space = createSpace(db, "Home");
  const month = createMonth(db, space, "2026-06");
  const acct = addRow(db, "bank", month, { name: "Checking", balance: c(100) });
  return { db, space, month, acct };
}

describe("schedules fill the income card on their own", () => {
  it("adopts a hand-entered paycheck on a payday instead of duplicating it", () => {
    const { db, space, month } = setup();
    addRow(db, "income", month, { label: "Pay", date: "2026-06-05", amount: c(500), status: "Received" });
    addSchedule(db, space, { label: "Paycheck", amount: c(500), frequency: "weekly", anchor: "2026-06-05", account: "Checking" });
    applySchedules(db, space, month, "2026-06");
    const incomes = loadMonth(db, month).incomes;
    expect(incomes.map((i) => i.date)).toEqual(["2026-06-05", "2026-06-12", "2026-06-19", "2026-06-26"]);
    expect(incomes[0]).toMatchObject({ label: "Pay", status: "Received" });
    expect(incomes.every((i) => i.scheduleId !== null)).toBe(true);
    expect(applySchedules(db, space, month, "2026-06")).toBe(0);
    expect(loadMonth(db, month).incomes).toHaveLength(4);
  });

  it("keeps a payday deleted on purpose deleted", () => {
    const { db, space, month } = setup();
    addSchedule(db, space, { label: "Paycheck", amount: c(500), frequency: "weekly", anchor: "2026-06-05" });
    applySchedules(db, space, month, "2026-06");
    const [first] = loadMonth(db, month).incomes;
    bulkRows(db, space, "income", [first.id], { type: "delete" });
    expect(applySchedules(db, space, month, "2026-06")).toBe(0);
    expect(loadMonth(db, month).incomes).toHaveLength(3);
  });

  it("does not fill a schedule that has no amount yet", () => {
    const { db, space, month } = setup();
    addSchedule(db, space, { anchor: "2026-06-01" });
    expect(applySchedules(db, space, month, "2026-06")).toBe(0);
  });

  it("follows an edited schedule: new amount, moved paydays, no stale Pending rows", () => {
    const { db, space, month, acct } = setup();
    const id = addSchedule(db, space, { label: "Paycheck", amount: c(500), frequency: "weekly", anchor: "2026-06-05", account: "Checking" });
    applySchedules(db, space, month, "2026-06");
    const first = loadMonth(db, month).incomes[0];
    db.prepare("UPDATE incomes SET status = 'Received' WHERE id = ?").run(first.id);

    updateSchedule(db, id, { amount: c(600), frequency: "biweekly" });
    syncSchedules(db, space, "2026-06");
    const incomes = loadMonth(db, month).incomes;
    expect(incomes.map((i) => [i.date, i.amount, i.status])).toEqual([
      ["2026-06-05", c(500), "Received"],
      ["2026-06-19", c(600), "Pending"],
    ]);
    expect(incomes[1].bankId).toBe(acct);
  });

  it("deleting a schedule removes its Pending paydays and keeps the Received ones", () => {
    const { db, space, month } = setup();
    const id = addSchedule(db, space, { label: "Paycheck", amount: c(500), frequency: "weekly", anchor: "2026-06-05" });
    applySchedules(db, space, month, "2026-06");
    db.prepare("UPDATE incomes SET status = 'Received' WHERE date = '2026-06-05'").run();
    deleteSchedule(db, id);
    expect(loadMonth(db, month).incomes.map((i) => i.date)).toEqual(["2026-06-05"]);
  });
});

describe("a deleted paycheck leaves the balance", () => {
  it("drops the Received amount from this month and the months after it", () => {
    const { db, space, month, acct } = setup();
    const inc = addRow(db, "income", month, { label: "Pay", date: "2026-06-05", amount: c(1000), status: "Received", bankId: acct });
    const next = createMonth(db, space, "2026-07", "2026-06");
    expect(loadMonth(db, next).banks[0].balance).toBe(c(1100));
    bulkRows(db, space, "income", [inc], { type: "delete" });
    expect(loadMonth(db, month).banks[0].balance).toBe(c(100));
    expect(loadMonth(db, next).banks[0].balance).toBe(c(100));
  });
});

describe("editing a schedule reaches its paychecks", () => {
  it("renames its Pending paychecks, and keeps the name of one that has been Received", () => {
    const { db, space, month } = setup();
    const id = addSchedule(db, space, { label: "Paycheck", amount: c(500), frequency: "biweekly", anchor: "2026-06-05" });
    applySchedules(db, space, month, "2026-06");
    db.prepare("UPDATE incomes SET status = 'Received' WHERE date = '2026-06-05'").run();
    updateSchedule(db, id, { label: "Salary" });
    syncSchedules(db, space, "2026-06");
    expect(loadMonth(db, month).incomes.map((i) => [i.label, i.status])).toEqual([["Paycheck", "Received"], ["Salary", "Pending"]]);
    // A blank name does not wipe the paycheck names.
    updateSchedule(db, id, { label: "" });
    syncSchedules(db, space, "2026-06");
    expect(loadMonth(db, month).incomes[1].label).toBe("Salary");
  });

  it("takes back the Pending paychecks when the amount is set to nothing, and brings them back with an amount", () => {
    const { db, space, month } = setup();
    const id = addSchedule(db, space, { label: "Paycheck", amount: c(500), frequency: "weekly", anchor: "2026-06-05" });
    applySchedules(db, space, month, "2026-06");
    db.prepare("UPDATE incomes SET status = 'Received' WHERE date = '2026-06-05'").run();
    updateSchedule(db, id, { amount: 0 });
    syncSchedules(db, space, "2026-06");
    expect(loadMonth(db, month).incomes.map((i) => i.date)).toEqual(["2026-06-05"]);
    updateSchedule(db, id, { amount: c(700) });
    syncSchedules(db, space, "2026-06");
    expect(loadMonth(db, month).incomes.map((i) => [i.date, i.amount, i.status])).toEqual([
      ["2026-06-05", c(500), "Received"],
      ["2026-06-12", c(700), "Pending"],
      ["2026-06-19", c(700), "Pending"],
      ["2026-06-26", c(700), "Pending"],
    ]);
  });
});


describe("a schedule changed after paychecks were removed by hand", () => {
  const removeByHand = (db: ReturnType<typeof setup>["db"], month: number) => {
    for (const i of loadMonth(db, month).incomes) bulkRows(db, 1, "income", [i.id], { type: "delete" });
  };

  it("fills the paydays of a new date, even though the old ones were removed", () => {
    const { db, space, month } = setup();
    const id = addSchedule(db, space, { label: "Disability", amount: c(576), frequency: "monthly", anchor: "2026-06-04" });
    applySchedules(db, space, month, "2026-06");
    removeByHand(db, month);
    // Left alone, the removed payday stays removed.
    applySchedules(db, space, month, "2026-06");
    expect(loadMonth(db, month).incomes).toHaveLength(0);

    updateSchedule(db, id, { anchor: "2026-06-10" });
    syncSchedules(db, space, "2026-06");
    expect(loadMonth(db, month).incomes.map((i) => [i.date, i.amount])).toEqual([["2026-06-10", c(576)]]);
  });

  it("brings a removed payday back when the amount changes, but not for a rename", () => {
    const { db, space, month } = setup();
    const id = addSchedule(db, space, { label: "Pay", amount: c(500), frequency: "monthly", anchor: "2026-06-04" });
    applySchedules(db, space, month, "2026-06");
    removeByHand(db, month);
    updateSchedule(db, id, { label: "Salary" });
    syncSchedules(db, space, "2026-06");
    expect(loadMonth(db, month).incomes).toHaveLength(0);
    updateSchedule(db, id, { amount: c(600) });
    syncSchedules(db, space, "2026-06");
    expect(loadMonth(db, month).incomes.map((i) => [i.label, i.amount])).toEqual([["Salary", c(600)]]);
  });
});
