import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "@/lib/db";
import { readWorkbook } from "@/lib/excel/read";
import { buildWorkbook } from "@/lib/excel/write";
import { addRow, createMonth, createSpace, findMonthId, importMonth, listMonthRows, listMonths, loadMonth } from "@/lib/store";

const c = (d: number) => Math.round(d * 100);

/** A made-up sheet in the original layout: formulas, a text income, prospective bank rows. */
function sampleSheet(wb: ExcelJS.Workbook, name: string) {
  const ws = wb.addWorksheet(name);
  ws.getCell("A1").value = name;
  ["Expenses", "Type", "Payment Status", "Expense Projected", "Payment Amount(Start)", "Payment Amount(End)", "Paid Amount", "Interest Status", "Notes", "Due", "Scheduled Date"].forEach(
    (h, i) => (ws.getCell(2, i + 1).value = h),
  );
  const rows: [string, string, number, number, string, number | null][] = [
    ["Water", "Pending", 40, 0, "Quarterly", 5],
    ["Mortgage", "Payment Made", 1500.5, 200000, " No interest", 1],
    ["Zakat", "None", 0, 0, "", null],
  ];
  rows.forEach(([n, s, p, start, interest, due], i) => {
    const r = 3 + i;
    ws.getCell(r, 1).value = { formula: `IF(OR(C${r}="Paid",C${r}="None"),0,D${r})`, result: 0 };
    ws.getCell(r, 2).value = n;
    ws.getCell(r, 3).value = s;
    ws.getCell(r, 4).value = p;
    ws.getCell(r, 5).value = start;
    ws.getCell(r, 8).value = interest;
    if (due) ws.getCell(r, 10).value = due;
  });
  ws.getCell("B6").value = "Total";
  ws.getCell("A6").value = { formula: "SUM(A3:A5)", result: 0 };
  ws.getCell("A10").value = "Income";
  ws.getCell("B10").value = "Date or What?";
  ws.getCell("D10").value = "Savings";
  ws.getCell("E10").value = "Mom's Bank";
  ws.getCell("H10").value = "Dad's Bank";
  ws.getCell("A11").value = 1200.25;
  ws.getCell("B11").value = new Date("2026-12-04T00:00:00Z");
  ws.getCell("C11").value = "Received";
  ws.getCell("A12").value = 800;
  ws.getCell("B12").value = { formula: "B11+7", result: new Date("2026-12-11T00:00:00Z") };
  ws.getCell("C12").value = "Pending";
  ws.getCell("A13").value = 300;
  ws.getCell("B13").value = "Side job";
  ws.getCell("C13").value = "Pending";
  ws.getCell("C14").value = "Received"; // a blank row with only a status
  ws.getCell("D11").value = { formula: "(A19+E11)-A6", result: 0 };
  ws.getCell("E11").value = 5000;
  ws.getCell("F11").value = "Checking";
  ws.getCell("H11").value = 250.75;
  ws.getCell("I11").value = "Savings";
  ws.getCell("E14").value = "Mom - Prospective Bank";
  ws.getCell("E15").value = { formula: "D11", result: 0 };
  ws.getCell("A19").value = { formula: 'SUMIF(C11:C18,"Pending",A11:A18)', result: 0 };
}

async function sampleBuffer(names: string[]) {
  const wb = new ExcelJS.Workbook();
  names.forEach((n) => sampleSheet(wb, n));
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

describe("readWorkbook", () => {
  it("reads one month per sheet from the original layout", async () => {
    const res = await readWorkbook(await sampleBuffer(["December", "November"]), 2026);
    expect(res.skipped).toEqual([]);
    expect(res.months.map((m) => m.ym)).toEqual(["2026-11", "2026-12"]);
    const m = res.months[1];
    expect(m.bills.map((b) => b.name)).toEqual(["Water", "Mortgage", "Zakat"]);
    expect(m.bills[1]).toMatchObject({ status: "Payment Made", projected: c(1500.5), startBalance: c(200000), dueDay: 1, interest: "No interest".padStart(0) || "" });
    expect(m.bills[0]).toMatchObject({ status: "Pending", projected: c(40), dueDay: 5, scheduledDay: null });
    expect(m.adHoc).toEqual([]);
  });

  it("reads income (dates, formula dates, text labels), skipping blank and total rows", async () => {
    const m = (await readWorkbook(await sampleBuffer(["December"]), 2026)).months[0];
    expect(m.incomes).toEqual([
      { label: "", date: "2026-12-04", amount: c(1200.25), status: "Received", account: "" },
      { label: "", date: "2026-12-11", amount: c(800), status: "Pending", account: "" },
      { label: "Side job", date: "2026-12-01", amount: c(300), status: "Pending", account: "" },
    ]);
  });

  it("reads banks from the income header row and ignores prospective rows", async () => {
    const m = (await readWorkbook(await sampleBuffer(["December"]), 2026)).months[0];
    expect(m.banks).toEqual([
      { name: "Mom's Bank", kind: "Checking", balance: c(5000) },
      { name: "Dad's Bank", kind: "Savings", balance: c(250.75) },
    ]);
  });

  it("reports sheets that are not months or have no expense table", async () => {
    const wb = new ExcelJS.Workbook();
    sampleSheet(wb, "December 2025");
    wb.addWorksheet("Notes").getCell("A1").value = "hi";
    wb.addWorksheet("January").getCell("A1").value = "nothing here";
    const res = await readWorkbook(new Uint8Array(await wb.xlsx.writeBuffer()), 2026);
    expect(res.months.map((m) => m.ym)).toEqual(["2025-12"]);
    expect(res.skipped.map((s) => s.sheet).sort()).toEqual(["January", "Notes"]);
  });
});

describe("export then import", () => {
  let db: Db;
  let space: number;
  beforeEach(() => {
    db = openDb(":memory:");
    space = createSpace(db, "Household");
  });

  it("round-trips months, one-offs and banks", async () => {
    const id = createMonth(db, space, "2026-12");
    addRow(db, "bank", id, { name: "Joint", kind: "Checking", balance: c(1000) });
    addRow(db, "bill", id, { name: "Water", status: "Paid", projected: c(40), startBalance: c(120), dueDay: 7, notes: "n" });
    addRow(db, "adhoc", id, { name: "Principal", status: "Payment Made", projected: c(500), tag: "Mortgage", linkedTo: "Mortgage" });
    addRow(db, "income", id, { label: "Pay", date: "2026-12-04", amount: c(2000), status: "Pending" });
    createMonth(db, space, "2027-01");

    const file = await buildWorkbook(listMonthRows(db, space));
    const read = await readWorkbook(new Uint8Array(file), 2000);
    expect(read.skipped).toEqual([]);
    expect(read.months.map((m) => m.ym)).toEqual(["2026-12", "2027-01"]);

    const other = openDb(":memory:");
    const s2 = createSpace(other, "Copy");
    for (const m of read.months) expect(importMonth(other, s2, m, false)).toBe("added");
    const a = loadMonth(db, id);
    const b = loadMonth(other, findMonthId(other, s2, "2026-12")!);
    const strip = <T extends { id: number }>(rows: T[]) => rows.map(({ id: _id, ...rest }) => rest);
    expect(strip(b.banks)).toEqual(strip(a.banks));
    expect(strip(b.bills)).toEqual(strip(a.bills));
    expect(strip(b.adHoc)).toEqual(strip(a.adHoc));
    expect(strip(b.incomes).map((i) => ({ ...i, scheduleId: null }))).toEqual(strip(a.incomes).map((i) => ({ ...i, scheduleId: null })));
  });

  it("writes the sheet's own formulas and calculated values", async () => {
    const id = createMonth(db, space, "2026-12");
    addRow(db, "bank", id, { name: "Joint", balance: c(1000) });
    addRow(db, "bill", id, { name: "Water", status: "Pending", projected: c(40) });
    addRow(db, "income", id, { label: "Pay", date: "2026-12-04", amount: c(200), status: "Pending" });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildWorkbook(listMonthRows(db, space))) as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("December 2026")!;
    expect(ws.getCell("A3").value).toMatchObject({ formula: 'IF(OR(C3="Paid",C3="None"),0,D3)', result: 40 });
    expect(ws.getCell("A4").value).toMatchObject({ formula: "SUM(A3:A3)", result: 40 });
    const cushion = ws.getCell("D10").value as { formula: string; result: number };
    expect(cushion.formula).toBe("(A18+E10)-A4");
    expect(cushion.result).toBe(1000 + 200 - 40);
  });

  it("import skips an existing month unless told to replace it", async () => {
    const id = createMonth(db, space, "2026-12");
    addRow(db, "bill", id, { name: "Old", projected: c(1) });
    const m = (await readWorkbook(await sampleBuffer(["December"]), 2026)).months[0];
    expect(importMonth(db, space, m, false)).toBe("skipped");
    expect(loadMonth(db, id).bills.map((b) => b.name)).toEqual(["Old"]);
    expect(importMonth(db, space, m, true)).toBe("replaced");
    const after = loadMonth(db, findMonthId(db, space, "2026-12")!);
    expect(after.bills.map((b) => b.name)).toEqual(["Water", "Mortgage", "Zakat"]);
    expect(listMonths(db, space)).toEqual(["2026-12"]);
  });
});
