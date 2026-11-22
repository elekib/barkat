import { MdAccountBalance, MdAccountBalanceWallet, MdAdd, MdBarChart, MdBolt, MdDonutLarge, MdEventRepeat, MdLabel, MdMoveToInbox, MdPayments, MdReceiptLong, MdSavings, MdShowChart, MdTaskAlt, MdCheckCircle, MdEvent, MdEventAvailable, MdWarningAmber, MdSwapVert, MdChevronLeft, MdChevronRight, MdClose, MdNorthEast, MdSchedule, MdInsights, MdTrendingDown, MdTrendingUp } from "react-icons/md";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import type { IconType } from "react-icons";
import {
  addRowAction,
  addScheduleAction,
  createMonthAction,
  saveRowAction,
  saveScheduleAction,
} from "@/app/actions/data";
import { BulkBar } from "@/components/BulkBar";
import { Collapsible } from "@/components/Collapsible";
import { IconChip } from "@/components/IconChip";
import { ClearMonth } from "@/components/ClearMonth";
import { CopyFromMonth } from "@/components/CopyFromMonth";
import { ManageAccounts } from "@/components/ManageAccounts";
import { MonthPicker } from "@/components/MonthPicker";
import { AutoForm } from "@/components/AutoForm";
import { Meter, RankedBars, SegmentedBar, Tile } from "@/components/charts/Charts";
import { TrendChart } from "@/components/charts/TrendChart";
import { btn, btnGhost, card, cell } from "@/components/ui";
import { accountBreakdown } from "@/lib/budget/accounts";
import { endBalance, outstanding } from "@/lib/budget/formulas";
import { dueStatus, monthMetrics, type DueStatus } from "@/lib/budget/metrics";
import { editableMoney, formatCompact, formatMoney } from "@/lib/budget/money";
import { currentYm, dateInMonth, isYm, monthEnd, monthLabel, monthStart, shiftYm } from "@/lib/budget/months";
import { summarize } from "@/lib/budget/summary";
import { FREQUENCIES, FREQUENCY_LABEL } from "@/lib/budget/schedules";
import { trend } from "@/lib/budget/trend";
import { BILL_STATUSES, INCOME_STATUSES } from "@/lib/budget/types";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { insightMonths, insightReport, insightsLink } from "@/lib/budget/insights";
import { applySchedules, findMonthId, getSpace, listMonthRows, listMonthSizes, listSchedules, loadMonth, previousMonth } from "@/lib/store";

export const dynamic = "force-dynamic";

type Params = { spaceId: string; ym: string };
type Ctx = { spaceId: number; ym: string };
type Kind = "bank" | "bill" | "income" | "adhoc";

/* Full class strings, so Tailwind can see them. */
/**
 * Column widths per table, written out in full so Tailwind can see each class. Editors get a narrow
 * first column for the row's select box; viewers do not.
 */
type GridKey = Kind | "schedule" | "account";
const GRIDS: Record<GridKey, { edit: string; view: string }> = {
  bank: { edit: "grid-cols-[2.5rem_1.4fr_1fr_1fr] min-w-[40rem]", view: "grid-cols-[1.4fr_1fr_1fr] min-w-[40rem]" },
  bill: { edit: "grid-cols-[2.5rem_1.5fr_9.5rem_11rem_6.5rem_6.5rem_6rem_6rem_9rem_9rem_1fr_1.4fr] min-w-[94rem]", view: "grid-cols-[1.5fr_9.5rem_11rem_6.5rem_6.5rem_6rem_6rem_9rem_9rem_1fr_1.4fr] min-w-[94rem]" },
  adhoc: { edit: "grid-cols-[2.5rem_1.5fr_9.5rem_11rem_6.5rem_1fr_1fr_1.5fr] min-w-[62rem]", view: "grid-cols-[1.5fr_9.5rem_11rem_6.5rem_1fr_1fr_1.5fr] min-w-[62rem]" },
  income: { edit: "grid-cols-[2.5rem_1.5fr_9rem_7rem_9rem_9.5rem] min-w-[48rem]", view: "grid-cols-[1.5fr_9rem_7rem_9rem_9.5rem] min-w-[48rem]" },
  schedule: { edit: "grid-cols-[2.5rem_1.5fr_10rem_9rem_7rem_9rem] min-w-[48rem]", view: "grid-cols-[1.5fr_10rem_9rem_7rem_9rem] min-w-[48rem]" },
  account: { edit: "grid-cols-[2.5rem_1.5fr_1fr_1fr_1fr_1fr_1fr_1fr] min-w-[46rem]", view: "grid-cols-[1.5fr_1fr_1fr_1fr_1fr_1fr_1fr] min-w-[46rem]" },
};
const gridOf = (kind: GridKey, canEdit: boolean) => GRIDS[kind][canEdit ? "edit" : "view"];

export default async function MonthPage({ params }: { params: Promise<Params> }) {
  const me = await requireUser();
  const canEdit = me.user.role === "admin";
  const p = await params;
  const spaceId = Number(p.spaceId);
  const db = getDb();
  const space = Number.isInteger(spaceId) ? getSpace(db, spaceId) : undefined;
  if (!space || !isYm(p.ym)) notFound();
  const ym = p.ym;

  const monthId = findMonthId(db, spaceId, ym);
  const now = currentYm();
  // Paydays from the schedules fill in on their own for this month and later ones (never history).
  // Rows already there, hand-entered or deleted on purpose, are matched and left alone.
  if (canEdit && monthId !== undefined && ym >= now) applySchedules(db, spaceId, monthId, ym);

  // One pass over every month: the copy sources and the trend both come from it.
  const allMonths = listMonthRows(db, spaceId);
  const sizes = listMonthSizes(db, spaceId);
  const sourceMonths = canEdit ? allMonths.filter((m) => m.ym !== ym) : [];
  const currentRows = monthId !== undefined ? loadMonth(db, monthId) : null;
  const copyControl =
    sourceMonths.length > 0 ? (
      <CopyFromMonth
        spaceId={spaceId}
        ym={ym}
        sources={sourceMonths
          .map((m) => ({
            ym: m.ym,
            banks: m.rows.banks.map((b) => ({ id: b.id, name: b.name, kind: b.kind })),
            bills: m.rows.bills.map((b) => ({ id: b.id, name: b.name, projected: b.projected, bankId: b.bankId })),
          }))
          .sort((a, b) => b.ym.localeCompare(a.ym))}
        exists={currentRows !== null}
        current={{ banks: currentRows?.banks.map((b) => b.name) ?? [], bills: currentRows?.bills.map((b) => b.name) ?? [] }}
        defaultFrom={[...sourceMonths.map((m) => m.ym)].sort().reverse().find((m) => m < ym) ?? sourceMonths[0].ym}
      />
    ) : null;

  // A month started ahead (by a schedule or copy-forward) can be cleared from the month picker.
  const canClear = canEdit && ym > now && currentRows !== null;

  const dueBadge = currentRows ? dueStatus(currentRows.bills, ym === now ? new Date().getDate() : null) : null;

  const header = (
    <div className="z-[15] md:sticky md:top-[var(--nav-h,3.5rem)] -mx-4 mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-line bg-page px-4 py-2.5">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
        <div>
          <p className="text-sm font-medium text-muted">{space.name}</p>
          <MonthPicker spaceId={spaceId} ym={ym} now={now} months={sizes} canClear={canClear} />
        </div>
        {dueBadge && <DueBadge due={dueBadge} />}
      </div>
      <nav aria-label="Month" className="flex flex-wrap items-end gap-1">
        {copyControl}
        <Link href={`/s/${spaceId}/files`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm font-medium text-ink2 transition hover:bg-surface2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
          <MdSwapVert className="h-5 w-5" aria-hidden />
          Import / export
        </Link>
        <Link href={`/s/${spaceId}/year/${ym.slice(0, 4)}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm font-medium text-ink2 transition hover:bg-surface2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
          <MdInsights className="h-5 w-5" aria-hidden />
          {ym.slice(0, 4)}
          <span className="sr-only"> year view</span>
        </Link>
        <Link href={`/s/${spaceId}/${shiftYm(ym, -1)}`} aria-label="Previous month" className={navBtn}>
          <MdChevronLeft className="h-5 w-5" />
        </Link>
        {ym !== now && (
          <Link href={`/s/${spaceId}/${now}`} className={`${navBtn} px-3 text-sm font-medium`}>
            This month
          </Link>
        )}
        <Link href={`/s/${spaceId}/${shiftYm(ym, 1)}`} aria-label="Next month" className={navBtn}>
          <MdChevronRight className="h-5 w-5" />
        </Link>
      </nav>
    </div>
  );

  if (monthId === undefined) {
    const source = previousMonth(db, spaceId, ym);
    return (
      <>
        {header}
        <section className={`${card} mx-auto max-w-xl px-6 py-14 text-center`}>
          <h2 className="mb-2 text-xl font-semibold">{monthLabel(ym)} has not been started</h2>
          {canEdit ? (
            <>
              <p className="mx-auto mb-5 text-sm text-muted">
                {source
                  ? `Start it from ${monthLabel(source)}: bills, bank balances and weekly income carry forward, statuses reset, and one-off payments stay behind.`
                  : "This is the first month in this space. Start it empty and add your bills, income and bank balances."}
              </p>
              <form action={createMonthAction}>
                <input type="hidden" name="spaceId" value={spaceId} />
                <input type="hidden" name="ym" value={ym} />
                <button type="submit" className={btn}>
                  {source ? `Start ${monthLabel(ym)} from ${monthLabel(source)}` : `Start ${monthLabel(ym)}`}
                </button>
              </form>
            </>
          ) : (
            <p className="text-sm text-muted">An administrator can start this month.</p>
          )}
        </section>
      </>
    );
  }

  const rows = loadMonth(db, monthId);
  const summary = summarize({
    bills: rows.bills,
    adHoc: rows.adHoc,
    incomes: rows.incomes,
    banks: rows.banks.map((b) => b.balance + b.made),
  });
  const ctx: Ctx = { spaceId, ym };
  // Payment Made has already left the account, so it is no longer part of what is still to pay.
  const madeOf = (items: { status: string; projected: number }[]) => items.filter((i) => i.status === "Payment Made").reduce((a, i) => a + i.projected, 0);
  const schedules = listSchedules(db, spaceId);

  const metrics = monthMetrics({
    bills: rows.bills,
    adHoc: rows.adHoc,
    incomes: rows.incomes,
    todayDay: ym === now ? new Date().getDate() : null,
  });
  const points = trend(
    allMonths.map(({ ym: m, rows: r }) => ({
      ym: m,
      bills: r.bills,
      adHoc: r.adHoc,
      incomes: r.incomes,
      banks: r.banks.map((b) => b.organic + b.made),
    })),
  );
  const before = [...points].reverse().find((pt) => pt.ym < ym);
  // Changes made in Manage accounts are not income or spending, so the change since last month leaves them out.
  const organicCushion = summarize({ bills: rows.bills, adHoc: rows.adHoc, incomes: rows.incomes, banks: rows.banks.map((b) => b.organic + b.made) }).cushion;
  const delta = before ? organicCushion - before.cushion : null;
  const billsPlanned = rows.bills.filter((b) => b.status !== "None").reduce((a, b) => a + b.projected, 0);
  const oneOffsPlanned = rows.adHoc.filter((a) => a.status !== "None").reduce((a, b) => a + b.projected, 0);
  const tagItems = Object.entries(summary.adHocByTag)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
  const accounts = accountBreakdown(
    rows.banks.map((b) => ({ id: b.id, name: b.name, balance: b.balance + b.made })),
    { bills: rows.bills, adHoc: rows.adHoc, incomes: rows.incomes },
  );
  const due = metrics.nextDue;
  const report = insightReport(
    insightMonths(
      allMonths.map(({ ym: m, rows: r }) => ({ ym: m, bills: r.bills, adHoc: r.adHoc, incomes: r.incomes, banks: r.banks.map((b) => b.organic + b.made) })),
      new Map(sizes.map((x) => [x.ym, x.items])),
    ),
    now,
  );
  // Only for the month the insights are about, so the banner never describes a different month than the one on screen.
  const insightsBanner = report.latest === ym ? <InsightsBanner spaceId={spaceId} ym={ym} report={report} /> : null;
  const positive = summary.cushion > 0;

  return (
    <>
      {header}
      {canClear && <ClearMonth spaceId={spaceId} ym={ym} />}
      {insightsBanner}

      {/* top row: cushion (75%) and what is due next (25%) */}
      <div className="mb-3 grid gap-3 lg:grid-cols-4">
      <section aria-label="Cushion" className={`${card} flex flex-wrap items-center justify-between gap-x-12 gap-y-5 bg-[radial-gradient(48rem_16rem_at_0%_0%,color-mix(in_srgb,var(--accent)_var(--glow),transparent),transparent)] px-6 py-5 lg:col-span-3`}>
        <div>
          <span className="flex items-center gap-2 text-[0.8125rem] font-medium text-muted">
            <IconChip icon={MdSavings} size="sm" />
            Cushion
          </span>
          <div className={`my-1 text-[clamp(2.6rem,6vw,3.6rem)] font-bold leading-none tracking-tight ${positive ? "text-good-bright" : "text-bad-bright"}`}>
            {formatMoney(summary.cushion)}
          </div>
          <p className="text-sm text-muted">
            <span
              className={`mr-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                positive ? "bg-[color-mix(in_srgb,var(--good)_14%,transparent)] text-good" : "bg-[color-mix(in_srgb,var(--bad)_14%,transparent)] text-bad"
              }`}
            >
              {positive ? <MdTrendingUp className="mr-1 inline h-4 w-4" /> : <MdTrendingDown className="mr-1 inline h-4 w-4" />}
              {positive ? "Saving" : "Debt"}
            </span>
            {delta !== null
              ? `${delta >= 0 ? "+" : "-"}${formatMoney(Math.abs(delta))} vs ${monthLabel(before!.ym)}`
              : "Bank balances plus income still to arrive, minus everything left to pay."}
          </p>
        </div>
        <dl className="grid w-full grid-cols-2 gap-x-8 gap-y-3 sm:w-auto">
          <Eq label="Banks" value={formatMoney(summary.paymentDifference)} />
          <Eq label="+ Income to arrive" value={formatMoney(summary.pendingIncome)} />
          <Eq label="− Bills to pay" value={formatMoney(summary.outstandingBills - madeOf(rows.bills))} />
          <Eq label="− One-offs to pay" value={formatMoney(summary.outstandingAdHoc - madeOf(rows.adHoc))} />
        </dl>
      </section>
      <DueCard due={due} />
      </div>

      {/* key numbers */}
      <section aria-label="Key numbers" className="mb-3 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(13rem,1fr))]">
        <Tile
          icon={MdTaskAlt}
          label="Paid so far"
          value={metrics.paidShare === null ? "–" : `${Math.round(metrics.paidShare * 100)}%`}
          note={`${metrics.billsPaidCount} of ${metrics.billsCount} bills · ${formatMoney(metrics.paid)} of ${formatMoney(metrics.planned)}`}
        >
          <Meter value={metrics.paidShare} label="Share of planned payments already paid" />
        </Tile>
        <Tile
          icon={MdMoveToInbox}
          label="Income received"
          value={metrics.incomeShare === null ? "–" : `${Math.round(metrics.incomeShare * 100)}%`}
          note={`${formatMoney(metrics.incomeReceived)} of ${formatMoney(metrics.incomeTotal)}`}
        >
          <Meter value={metrics.incomeShare} label="Share of expected income already received" />
        </Tile>
        <Tile
          icon={MdSavings}
          label="Saved this month"
          value={metrics.savingsRate === null ? "–" : `${Math.round(metrics.savingsRate * 100)}%`}
          tone={metrics.savingsRate === null ? undefined : metrics.left >= 0 ? "good" : "bad"}
          note={`${metrics.left >= 0 ? "" : "-"}${formatMoney(Math.abs(metrics.left))} left of ${formatMoney(metrics.incomeTotal)} income`}
        />
        <Tile icon={MdNorthEast} label="Sent, not cleared" value={formatMoney(summary.paymentMade)} note={`Already out of the bank: ${formatMoney(summary.paymentDifference)} left`} />
      </section>

      {/* charts */}
      <section aria-label="Charts" className="mb-3 grid gap-3 lg:grid-cols-2">
        <Panel id="spending-by-status" icon={MdDonutLarge} title="Spending by status" sub="Bills and one-offs planned this month">
          <SegmentedBar
            emptyText="Nothing planned yet."
            parts={[
              { key: "paid", label: "Paid", glyph: <MdCheckCircle />, value: metrics.split.paid, color: "--st-paid" },
              { key: "made", label: "Payment made", glyph: <MdNorthEast />, value: metrics.split.paymentMade, color: "--st-made" },
              { key: "pending", label: "Pending", glyph: <MdSchedule />, value: metrics.split.pending, color: "--st-pending" },
            ]}
          />
        </Panel>
        <Panel id="money-in-out" icon={MdSwapVert} title="Money in and out" sub="What was expected to arrive against what is planned to leave">
          <RankedBars
            emptyText="Add income and bills to compare."
            items={[
              { label: "Income", value: metrics.incomeTotal },
              { label: "Bills", value: billsPlanned },
              { label: "One-offs", value: oneOffsPlanned },
            ].filter((i) => i.value > 0)}
          />
        </Panel>
        <Panel id="largest-payments" icon={MdBarChart} title="Largest payments" sub="Top five bills and one-offs this month">
          <RankedBars items={metrics.largest.map((l) => ({ label: l.name, value: l.amount }))} emptyText="No amounts yet." />
        </Panel>
        <Panel id="oneoffs-by-tag" icon={MdLabel} title="One-offs by tag" sub="Principal payments, charity, travel and the rest">
          <RankedBars items={tagItems} emptyText="Tag a one-off payment to see it here." />
        </Panel>
        <Panel
          id="over-time"
          icon={MdShowChart}
          title="Over time"
          sub={`Income and spending in every month of this space${points.length >= 2 ? ` · peak ${formatCompact(Math.max(...points.map((pt) => Math.max(pt.income, pt.spending))))}` : ""}`}
          className="lg:col-span-2"
        >
          <TrendChart points={points} />
        </Panel>
      </section>

      {(accounts.length > 0 || canEdit) && (
        <Collapsible
          id="by-account"
          stacked
          chip={<IconChip icon={MdAccountBalanceWallet} />}
          title="Accounts"
          sub="Shared by every month. Each balance moves when income is Received and bills are Paid."
          summary={`${accounts.length} account${accounts.length === 1 ? "" : "s"} · ${formatMoney(summary.paymentDifference)}`}
          pad="md"
          className={`${card} mb-6`}
          actions={
            canEdit ? (
              <ManageAccounts
                spaceId={spaceId}
                ym={ym}
                monthName={monthLabel(ym)}
                accounts={rows.banks.map((b) => ({
                  id: b.id,
                  name: b.name,
                  kind: b.kind,
                  balance: b.balance,
                  uses: [...rows.bills, ...rows.adHoc, ...rows.incomes].filter((x) => x.bankId === b.id).length,
                }))}
              />
            ) : undefined
          }
        >
          <div className="-m-1 overflow-x-auto p-1">
            <Head grid={gridOf("account", false)} labels={["Account", "Balance", "This month", "+ Income", "− Bills", "− One-offs", "Cushion"]} align="lrrrrrr" />
            {accounts.length === 0 && <p className="px-2 py-2 text-sm text-muted">No accounts yet. Use Manage accounts to add one.</p>}
            {accounts.map((a) => {
              const opening = rows.banks.find((b) => b.id === a.id)?.opening;
              const change = opening === undefined || a.id === null ? null : rows.banks.find((b) => b.id === a.id)!.organic - opening;
              return (
                <div key={a.id ?? "none"} className={`${ROW} ${gridOf("account", false)} text-sm tabular-nums`}>
                  <span className="truncate px-2 font-medium">{a.name}</span>
                  <span className="px-2 text-right font-semibold">{formatMoney(rows.banks.find((b) => b.id === a.id)?.balance ?? a.balance)}</span>
                  <span className={`px-2 text-right ${change === null || change === 0 ? "text-muted" : change > 0 ? "text-good" : "text-bad"}`}>
                    {change === null ? "–" : change === 0 ? formatMoney(0) : `${change > 0 ? "▲ " : "▼ "}${formatMoney(Math.abs(change))}`}
                  </span>
                  {[a.incomeToArrive, a.billsToPay, a.oneOffsToPay].map((v, i) => (
                    <span key={i} className="px-2 text-right">
                      {formatMoney(v)}
                    </span>
                  ))}
                  <span className={`px-2 text-right font-semibold ${a.cushion >= 0 ? "text-good" : "text-bad"}`}>{formatMoney(a.cushion)}</span>
                </div>
              );
            })}
          </div>
        </Collapsible>
      )}

      {/* editable sheets: viewers see them but cannot change them */}
      <h2 className="mb-3 text-lg font-semibold tracking-tight">{canEdit ? "Edit this month" : "This month in detail"}</h2>

      <Sheet id="bills" summary={`${rows.bills.length} · to pay ${formatMoney(summary.outstandingBills)}`} icon={MdReceiptLong} title="Bills" kind="bill" ctx={ctx} addLabel="Add bill" canEdit={canEdit} footer={<Total label="To pay" value={formatMoney(summary.outstandingBills)} />}>
        <Head grid={gridOf("bill", canEdit)} labels={["Bill", "Status", "Paid from", "Projected", "Start bal.", "End bal.", "To pay", "Due", "Sched.", "Interest", "Notes"]} align="lllrrrrccll" bulk={canEdit ? { formId: "bulk-bill", noun: "bills" } : undefined} />
        {rows.bills.map((b) => {
          const item = { name: b.name, status: b.status, projected: b.projected, startBalance: b.startBalance };
          return (
            <Row
              key={`${b.id}-${b.bankId}-${b.name}-${b.status}-${b.projected}-${b.startBalance}-${b.interest}-${b.notes}-${b.dueDay}-${b.scheduledDay}`}
              kind="bill"
              id={b.id}
              ctx={ctx}
              canEdit={canEdit}
              label={b.name}
            >
              <input name="name" defaultValue={b.name} placeholder="Name" aria-label="Bill name" className={cell} />
              <StatusSelect value={b.status} options={BILL_STATUSES} />
              <AccountSelect value={b.bankId} banks={rows.banks} label="Paid from" />
              <input name="projected" defaultValue={editableMoney(b.projected)} placeholder="0.00" inputMode="decimal" aria-label="Projected" className={`${cell} text-right tabular-nums`} />
              <input name="startBalance" defaultValue={editableMoney(b.startBalance)} placeholder="0.00" inputMode="decimal" aria-label="Start balance" className={`${cell} text-right tabular-nums`} />
              <span className="pr-2 text-right text-sm tabular-nums text-muted">{formatMoney(endBalance(item))}</span>
              <span className="pr-2 text-right text-sm tabular-nums text-muted">{formatMoney(outstanding(item))}</span>
              <input name="dueDay" type="date" min={monthStart(ym)} max={monthEnd(ym)} defaultValue={b.dueDay ? dateInMonth(ym, b.dueDay) : ""} aria-label="Due date" className={cell} />
              <input name="scheduledDay" type="date" min={monthStart(ym)} max={monthEnd(ym)} defaultValue={b.scheduledDay ? dateInMonth(ym, b.scheduledDay) : ""} aria-label="Scheduled date" className={cell} />
              <input name="interest" defaultValue={b.interest} aria-label="Interest status" className={cell} />
              <input name="notes" defaultValue={b.notes} placeholder="Notes" aria-label="Notes" className={cell} />
            </Row>
          );
        })}
        {canEdit && <BulkBar formId="bulk-bill" rowKind="bill" spaceId={spaceId} ym={ym} noun={["bill", "bills"]} statuses={BILL_STATUSES} accounts={rows.banks.map((b) => ({ value: String(b.id), label: b.name || "Untitled account" }))} />}
      </Sheet>

      <Sheet
        id="one-offs"
        summary={`${rows.adHoc.length} · to pay ${formatMoney(summary.outstandingAdHoc)}`}
        icon={MdBolt}
        title="One-off payments"
        kind="adhoc"
        ctx={ctx}
        addLabel="Add one-off"
        canEdit={canEdit}
        hint="Principal-only payments, zakat, trips. They come out of the same cushion."
        footer={
          <>
            <Total label="To pay" value={formatMoney(summary.outstandingAdHoc)} />
            {Object.keys(summary.adHocByTag).length > 0 && (
              <p className="mt-1 text-sm text-muted">
                By tag:{" "}
                {Object.entries(summary.adHocByTag)
                  .map(([tag, cents]) => `${tag} ${formatMoney(cents)}`)
                  .join(" · ")}
              </p>
            )}
          </>
        }
      >
        <Head grid={gridOf("adhoc", canEdit)} labels={["Payment", "Status", "Paid from", "Amount", "Tag", "Linked to", "Notes"]} align="lllrlll" bulk={canEdit ? { formId: "bulk-adhoc", noun: "one-off payments" } : undefined} />
        {rows.adHoc.map((a) => (
          <Row key={`${a.id}-${a.bankId}-${a.name}-${a.status}-${a.projected}-${a.tag}-${a.linkedTo}-${a.notes}`} kind="adhoc" id={a.id} ctx={ctx} canEdit={canEdit} label={a.name}>
            <input name="name" defaultValue={a.name} placeholder="Name" aria-label="Payment name" className={cell} />
            <StatusSelect value={a.status} options={BILL_STATUSES} />
            <AccountSelect value={a.bankId} banks={rows.banks} label="Paid from" />
            <input name="projected" defaultValue={editableMoney(a.projected)} placeholder="0.00" inputMode="decimal" aria-label="Amount" className={`${cell} text-right tabular-nums`} />
            <input name="tag" defaultValue={a.tag} placeholder="Charity, Travel…" aria-label="Tag" className={cell} />
            <input name="linkedTo" defaultValue={a.linkedTo} placeholder="e.g. Mortgage" aria-label="Linked bill" className={cell} />
            <input name="notes" defaultValue={a.notes} placeholder="Notes" aria-label="Notes" className={cell} />
          </Row>
        ))}
        {canEdit && <BulkBar formId="bulk-adhoc" rowKind="adhoc" spaceId={spaceId} ym={ym} noun={["one-off payment", "one-off payments"]} statuses={BILL_STATUSES} accounts={rows.banks.map((b) => ({ value: String(b.id), label: b.name || "Untitled account" }))} />}
      </Sheet>

      <Collapsible
        id="income-schedules"
        chip={<IconChip icon={MdEventRepeat} size="sm" />}
        title="Income schedules"
        sub="Paydays are added to the Income card on their own, with no duplicates. Use Add income for one-off pay."
        summary={`${schedules.length} schedule${schedules.length === 1 ? "" : "s"}`}
        className={`${card} mb-3`}
        actions={
          canEdit ? (
            <>
              <form action={addScheduleAction}>
                <input type="hidden" name="spaceId" value={spaceId} />
                <input type="hidden" name="ym" value={ym} />
                <button type="submit" className={`${btnGhost} gap-1`}>
                  <MdAdd className="h-4 w-4" aria-hidden />
                  Add schedule
                </button>
              </form>
            </>
          ) : undefined
        }
      >
        <div className="-m-1 overflow-x-auto p-1">
          {schedules.length === 0 ? (
            <p className="py-2 text-sm text-muted">No schedules yet. Add one for a paycheck that repeats weekly, every two weeks or monthly.</p>
          ) : (
            <>
              <Head grid={gridOf("schedule", canEdit)} labels={["What", "Repeats", "A payday", "Amount", "Into"]} align="lllrl" bulk={canEdit ? { formId: "bulk-schedule", noun: "schedules" } : undefined} />
              {schedules.map((sch) => (
                <AutoForm
                  key={`${sch.id}-${sch.label}-${sch.amount}-${sch.frequency}-${sch.anchor}-${sch.account}`}
                  action={saveScheduleAction}
                  className={`${ROW} ${gridOf("schedule", canEdit)}`}
                >
                  <input type="hidden" name="id" value={sch.id} />
                  <input type="hidden" name="spaceId" value={spaceId} />
                  <input type="hidden" name="ym" value={ym} />
                  {canEdit && <input type="checkbox" form="bulk-schedule" name="id" value={sch.id} aria-label={`Select ${sch.label || "schedule"}`} className={PICK} />}
                  <fieldset disabled={!canEdit} className="contents">
                    <input name="label" defaultValue={sch.label} placeholder="Paycheck" aria-label="Schedule label" className={cell} />
                    <select name="frequency" defaultValue={sch.frequency} aria-label="Repeats" className={`${cell} select-arrow bg-surface`}>
                      {FREQUENCIES.map((f) => (
                        <option key={f} value={f}>
                          {FREQUENCY_LABEL[f]}
                        </option>
                      ))}
                    </select>
                    <input name="anchor" type="date" defaultValue={sch.anchor} aria-label="A payday" className={cell} />
                    <input name="amount" defaultValue={editableMoney(sch.amount)} placeholder="0.00" inputMode="decimal" aria-label="Amount" className={`${cell} text-right tabular-nums`} />
                    <select name="account" defaultValue={sch.account} aria-label="Into account" className={`${cell} select-arrow bg-surface`}>
                      <option value="">No account</option>
                      {rows.banks.map((b) => (
                        <option key={b.id} value={b.name}>
                          {b.name || "Untitled account"}
                        </option>
                      ))}
                    </select>
                  </fieldset>
                </AutoForm>
              ))}
              {canEdit && <BulkBar formId="bulk-schedule" rowKind="schedule" spaceId={spaceId} ym={ym} noun={["schedule", "schedules"]} accounts={rows.banks.map((b) => ({ value: b.name, label: b.name || "Untitled account" }))} deleteNote="Paydays it added that are still Pending are removed. Received ones stay." />}
            </>
          )}
        </div>
      </Collapsible>

      <Sheet id="income" summary={`${rows.incomes.length} · to arrive ${formatMoney(summary.pendingIncome)}`} icon={MdPayments} title="Income" kind="income" ctx={ctx} addLabel="Add income" canEdit={canEdit} footer={<Total label="Still to arrive" value={formatMoney(summary.pendingIncome)} />}>
        <Head grid={gridOf("income", canEdit)} labels={["What", "Date", "Amount", "Into", "Status"]} align="llrll" bulk={canEdit ? { formId: "bulk-income", noun: "income entries" } : undefined} />
        {rows.incomes.map((i) => (
          <Row key={`${i.id}-${i.bankId}-${i.label}-${i.date}-${i.amount}-${i.status}`} kind="income" id={i.id} ctx={ctx} canEdit={canEdit} label={i.label || i.date}>
            <input name="label" defaultValue={i.label} placeholder="Paycheck" aria-label="Income label" className={cell} />
            <input name="date" type="date" defaultValue={i.date} aria-label="Date" className={cell} />
            <input name="amount" defaultValue={editableMoney(i.amount)} placeholder="0.00" inputMode="decimal" aria-label="Amount" className={`${cell} text-right tabular-nums`} />
            <AccountSelect value={i.bankId} banks={rows.banks} label="Into account" />
            <StatusSelect value={i.status} options={INCOME_STATUSES} />
          </Row>
        ))}
        {canEdit && <BulkBar formId="bulk-income" rowKind="income" spaceId={spaceId} ym={ym} noun={["income entry", "income entries"]} statuses={INCOME_STATUSES} accounts={rows.banks.map((b) => ({ value: String(b.id), label: b.name || "Untitled account" }))} />}
      </Sheet>
    </>
  );
}

/* ---------- small pieces ---------- */

const navBtn =
  "grid h-9 min-w-9 place-items-center rounded-lg border border-line bg-surface text-lg leading-none text-ink2 transition hover:bg-surface2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent";

function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10 > 3 ? 0 : n % 10] ?? "th"}`;
}

type Due = NonNullable<ReturnType<typeof monthMetrics>["nextDue"]>;

/** What to pay next, loud on purpose: it is the one thing to act on. Overdue turns red. */
function DueCard({ due }: { due: Due | null }) {
  const overdue = due !== null && due.days !== null && due.days < 0;
  const soon = due !== null && due.days !== null && due.days >= 0 && due.days <= 3;
  const Icon = !due ? MdEventAvailable : overdue ? MdWarningAmber : MdEvent;
  const tone = overdue
    ? "border-bad bg-[linear-gradient(145deg,color-mix(in_srgb,var(--bad)_22%,var(--surface)),color-mix(in_srgb,var(--bad)_6%,var(--surface)))]"
    : due
      ? "border-accent bg-[linear-gradient(145deg,color-mix(in_srgb,var(--accent)_24%,var(--surface)),color-mix(in_srgb,var(--accent)_6%,var(--surface)))]"
      : "border-line bg-surface";
  const ink = overdue ? "text-bad" : due ? "text-accent" : "text-good";
  const when = !due
    ? "Nothing left to pay with a due day"
    : due.days === null
      ? `Due on the ${ordinal(due.dueDay)}`
      : due.days === 0
        ? "Due today"
        : due.days > 0
          ? `In ${due.days} day${due.days === 1 ? "" : "s"} · the ${ordinal(due.dueDay)}`
          : `Overdue by ${-due.days} day${due.days === -1 ? "" : "s"} · the ${ordinal(due.dueDay)}`;
  return (
    <section
      aria-label="Next due"
      className={`flex flex-col justify-center gap-1.5 rounded-2xl border-2 px-5 py-5 shadow-card ${tone}`}
    >
      <span className={`flex items-center gap-1.5 text-[0.8125rem] font-semibold uppercase tracking-wider ${ink}`}>
        <Icon className="h-5 w-5" aria-hidden />
        {due && due.days !== null ? "Next due" : due ? "First due" : "Due"}
      </span>
      <strong className="break-words text-2xl font-bold leading-tight tracking-tight">{due ? due.name || "Untitled" : "All clear"}</strong>
      <span className={`text-sm ${overdue || soon ? `font-semibold ${ink}` : "text-muted"}`}>{when}</span>
    </section>
  );
}

/** A small pill in the header: how urgent the unpaid bills are. Colour plus icon plus words, never colour alone. */
function DueBadge({ due }: { due: DueStatus }) {
  const style = {
    overdue: { Icon: MdWarningAmber, tone: "border-bad bg-[color-mix(in_srgb,var(--bad)_14%,var(--surface))] text-bad" },
    soon: { Icon: MdSchedule, tone: "border-[var(--st-pending)] bg-[color-mix(in_srgb,var(--st-pending)_26%,var(--surface))] text-ink" },
    later: { Icon: MdEvent, tone: "border-line bg-surface2 text-ink2" },
    clear: { Icon: MdCheckCircle, tone: "border-[color-mix(in_srgb,var(--good)_45%,transparent)] bg-[color-mix(in_srgb,var(--good)_14%,var(--surface))] text-good" },
  }[due.level];
  const when =
    due.days === null
      ? due.dueDay !== null
        ? `the ${ordinal(due.dueDay)}`
        : ""
      : due.days === 0
        ? "today"
        : due.days > 0
          ? `in ${due.days} day${due.days === 1 ? "" : "s"}`
          : `${-due.days} day${due.days === -1 ? "" : "s"} late`;
  const label =
    due.level === "clear"
      ? "Nothing waiting on a due date"
      : due.level === "overdue"
        ? `${due.overdueCount} overdue · ${due.name || "Untitled"} · ${when}`
        : `${due.level === "soon" ? "Due soon" : "Next"} · ${due.name || "Untitled"} · ${when}`;
  const title =
    due.level === "clear"
      ? "No bill with a due day is still waiting for a payment."
      : `${due.openCount} bill${due.openCount === 1 ? "" : "s"} with a due day still waiting for a payment. Mark a payment as made and it drops off.`;
  return (
    <span title={title} role="status" className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold ${style.tone}`}>
      <style.Icon className="h-4 w-4 shrink-0" aria-hidden />
      <span className="truncate">{label}</span>
    </span>
  );
}

function Eq({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[0.8125rem] text-muted">{label}</dt>
      <dd className="m-0 font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function Panel({ id, icon, title, sub, className = "", children }: { id: string; icon: IconType; title: string; sub: string; className?: string; children: ReactNode }) {
  return (
    <Collapsible as="article" id={id} stacked chip={<IconChip icon={icon} />} title={title} sub={sub} pad="md" className={`${card} min-w-0 ${className}`}>
      {children}
    </Collapsible>
  );
}

function Sheet({
  id,
  icon,
  title,
  kind,
  ctx,
  addLabel,
  hint,
  summary,
  canEdit,
  footer,
  children,
}: {
  id: string;
  icon: IconType;
  title: string;
  kind: Kind;
  ctx: Ctx;
  addLabel: string;
  hint?: string;
  summary?: string;
  canEdit: boolean;
  /** Totals under the table. Outside the scrolling area, so they stay put when the table scrolls sideways. */
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Collapsible
      id={id}
      chip={<IconChip icon={icon} size="sm" />}
      title={title}
      sub={hint}
      summary={summary}
      className={`${card} mb-3`}
      actions={
        canEdit ? (
          <form action={addRowAction}>
            <input type="hidden" name="rowKind" value={kind} />
            <input type="hidden" name="spaceId" value={ctx.spaceId} />
            <input type="hidden" name="ym" value={ctx.ym} />
            <button type="submit" className={`${btnGhost} gap-1`}>
              <MdAdd className="h-4 w-4" aria-hidden />
              {addLabel}
            </button>
          </form>
        ) : undefined
      }
    >
      <div className="-m-1 overflow-x-auto p-1">{children}</div>
      {footer}
    </Collapsible>
  );
}

const HEAD = "grid items-center gap-1.5 py-1 text-[0.6875rem] font-semibold uppercase tracking-wider text-muted";
const ROW = "grid items-center gap-1.5 rounded-lg py-0.5 hover:bg-[color-mix(in_srgb,var(--ink)_6%,transparent)]";
const PICK = "h-6 w-6 justify-self-center accent-[var(--accent)]";

/**
 * A table's header row. `align` has one letter per label (l, r or c) and must match how that column's
 * cells align, so a heading sits over its numbers. For editors the first cell selects every row, which
 * the toolbar (BulkBar) acts on.
 */
function Head({ grid, labels, align, bulk }: { grid: string; labels: string[]; align: string; bulk?: { formId: string; noun: string } }) {
  const side = { l: "text-left", r: "text-right", c: "text-center" } as const;
  return (
    <div className={`${HEAD} ${grid}`}>
      {bulk && <input type="checkbox" data-bulk-all={bulk.formId} aria-label={`Select all ${bulk.noun}`} className={PICK} />}
      {labels.map((l, i) => (
        <span key={i} className={`px-2 ${side[(align[i] ?? "l") as "l" | "r" | "c"]}`} aria-hidden>
          {l}
        </span>
      ))}
    </div>
  );
}

function Row({ kind, id, ctx, canEdit, label, children }: { kind: Kind; id: number; ctx: Ctx; canEdit: boolean; label: string; children: ReactNode }) {
  return (
    <AutoForm action={saveRowAction} className={`${ROW} ${gridOf(kind, canEdit)}`}>
      <input type="hidden" name="rowKind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="spaceId" value={ctx.spaceId} />
      <input type="hidden" name="ym" value={ctx.ym} />
      {/* The select box belongs to the table's toolbar form, not this row's form. */}
      {canEdit && <input type="checkbox" form={`bulk-${kind}`} name="id" value={id} aria-label={`Select ${label || "row"}`} className={PICK} />}
      {/* A disabled fieldset disables every control inside it, which is how viewers get read-only rows. */}
      <fieldset disabled={!canEdit} className="contents">
        {children}
      </fieldset>
    </AutoForm>
  );
}

const STATUS_TONE: Record<string, string> = {
  None: "border-l-none bg-[color-mix(in_srgb,var(--st-none)_14%,var(--surface))]",
  Pending: "border-l-pending bg-[color-mix(in_srgb,var(--st-pending)_14%,var(--surface))]",
  "Payment Made": "border-l-made bg-[color-mix(in_srgb,var(--st-made)_14%,var(--surface))]",
  Paid: "border-l-paid bg-[color-mix(in_srgb,var(--st-paid)_14%,var(--surface))]",
  Received: "border-l-paid bg-[color-mix(in_srgb,var(--st-paid)_14%,var(--surface))]",
};

/** A coloured edge plus the written label: state is never colour alone. */
function StatusSelect({ value, options }: { value: string; options: readonly string[] }) {
  return (
    <select
      name="status"
      defaultValue={value}
      aria-label="Status"
      className={`select-arrow w-full min-w-0 rounded-md border border-line border-l-4 px-2 py-1 text-sm font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-100 ${STATUS_TONE[value] ?? STATUS_TONE.None}`}
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

/** Which account a payment comes out of (or income goes into). Empty means no account chosen. */
function AccountSelect({ value, banks, label }: { value: number | null; banks: { id: number; name: string }[]; label: string }) {
  return (
    <select name="bankId" defaultValue={value ?? ""} aria-label={label} className={`${cell} select-arrow bg-surface`}>
      <option value="">No account</option>
      {banks.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name || "Untitled account"}
        </option>
      ))}
    </select>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-end gap-3 pr-2 pt-2 tabular-nums">
      <span className="text-muted">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function InsightsBanner({ spaceId, ym, report }: { spaceId: number; ym: string; report: ReturnType<typeof insightReport> }) {
  const warns = report.insights.filter((i) => i.severity === "warn").length;
  const n = report.insights.length;
  const top = report.insights[0];
  const next = report.forecast[0];
  return (
    <section
      aria-label="Insights"
      className={`${card} insight-pop mb-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 !border-accent/50 bg-[linear-gradient(110deg,color-mix(in_srgb,var(--accent)_30%,var(--surface)),color-mix(in_srgb,var(--fill)_22%,var(--surface))_55%,color-mix(in_srgb,var(--series-1)_16%,var(--surface)))] px-5 py-4 shadow-[0_0.75rem_2rem_color-mix(in_srgb,var(--accent)_28%,transparent)]`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent text-accent-ink shadow-card" aria-hidden>
          {n > 0 ? <MdWarningAmber className="h-6 w-6" /> : <MdInsights className="h-6 w-6" />}
        </span>
        <div className="min-w-0">
          <p className="text-base font-semibold">
            {n === 0 ? "Insights: nothing unusual this month" : `Insights: ${n} ${n === 1 ? "thing" : "things"} worth a look${warns > 0 ? `, ${warns} to watch` : ""}`}
          </p>
          <p className="truncate text-sm text-ink2">
            {top ? top.title : next ? `Cushion expected around ${formatCompact(next.expected)} next month.` : "Bills and spending look like a usual month."}
          </p>
        </div>
      </div>
      <Link href={insightsLink(spaceId, { page: "month", ym })} className={`${btn} gap-1.5 whitespace-nowrap`}>
        See insights
        <MdChevronRight className="h-4 w-4" aria-hidden />
      </Link>
    </section>
  );
}
