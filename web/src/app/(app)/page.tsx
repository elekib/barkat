import Link from "next/link";
import {
  MdAccountBalance,
  MdCheckCircle,
  MdChevronRight,
  MdInsights,
  MdErrorOutline,
  MdEvent,
  MdInfoOutline,
  MdNorthEast,
  MdSavings,
  MdSchedule,
  MdSouthWest,
  MdWarningAmber,
  MdWallet,
} from "react-icons/md";
import { Meter, Tile } from "@/components/charts/Charts";
import { CreateSpace } from "@/components/CreateSpace";
import { DeleteBook } from "@/components/DeleteBook";
import { ReorderBooks } from "@/components/ReorderBooks";
import { IconChip } from "@/components/IconChip";
import { card } from "@/components/ui";
import { insightMonths, insightReport, insightsLink, overviewInsights, type OverviewInsights } from "@/lib/budget/insights";
import { formatCompact, formatMoney } from "@/lib/budget/money";
import { currentYm, monthLabel } from "@/lib/budget/months";
import { dueStatus } from "@/lib/budget/metrics";
import { suggestions, totals, type SpaceSnapshot, type SuggestionLevel } from "@/lib/budget/overview";
import { summarize } from "@/lib/budget/summary";
import { adminOrNull, requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { findMonthId, listMonthRows, listMonthSizes, listSpaces, loadMonth, spaceContents } from "@/lib/store";

export const dynamic = "force-dynamic";

const NOTE_STYLE: Record<SuggestionLevel, { icon: typeof MdInfoOutline; tone: string; label: string }> = {
  bad: { icon: MdErrorOutline, tone: "text-bad", label: "Needs action" },
  warn: { icon: MdWarningAmber, tone: "text-ink", label: "Coming up" },
  info: { icon: MdInfoOutline, tone: "text-accent", label: "Tidy up" },
};

function greeting(hour: number): string {
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

export default async function Home() {
  const db = getDb();
  const me = await requireUser();
  const canEdit = !!(await adminOrNull());
  const now = new Date();
  const ym = currentYm(now);

  const snapshots: SpaceSnapshot[] = listSpaces(db).map((s) => {
    const monthId = findMonthId(db, s.id, ym);
    if (monthId === undefined) {
      return {
        id: s.id,
        name: s.name,
        started: false,
        accounts: 0,
        bankTotal: 0,
        cushion: 0,
        toPay: 0,
        incomeToArrive: 0,
        paidShare: null,
        due: dueStatus([], now.getDate()),
      };
    }
    const rows = loadMonth(db, monthId);
    const sum = summarize({ bills: rows.bills, adHoc: rows.adHoc, incomes: rows.incomes, banks: rows.banks.map((b) => b.balance + b.made) });
    const planned = [...rows.bills, ...rows.adHoc].filter((p) => p.status !== "None");
    const total = planned.reduce((a, p) => a + p.projected, 0);
    const paid = planned.filter((p) => p.status === "Paid").reduce((a, p) => a + p.projected, 0);
    return {
      id: s.id,
      name: s.name,
      started: true,
      accounts: rows.banks.length,
      bankTotal: sum.bankTotal,
      cushion: sum.cushion,
      toPay: sum.outstandingBills + sum.outstandingAdHoc,
      incomeToArrive: sum.pendingIncome,
      paidShare: total > 0 ? paid / total : null,
      due: dueStatus(rows.bills, now.getDate()),
    };
  });

  const all = totals(snapshots);
  const insights = overviewInsights(
    listSpaces(db).map((sp) => ({
      spaceId: sp.id,
      name: sp.name,
      report: insightReport(
        insightMonths(
          listMonthRows(db, sp.id).map(({ ym: m, rows: r }) => ({ ym: m, bills: r.bills, adHoc: r.adHoc, incomes: r.incomes, banks: r.banks.map((b) => b.organic + b.made) })),
          new Map(listMonthSizes(db, sp.id).map((x) => [x.ym, x.items])),
        ),
        ym,
      ),
    })),
  );
  const notes = suggestions(snapshots, monthLabel(ym));
  const username = me.user.username;

  return (
    <div className="space-y-4">
      <header
        className={`${card} flex flex-wrap items-center justify-between gap-x-6 gap-y-4 bg-[radial-gradient(48rem_16rem_at_0%_0%,color-mix(in_srgb,var(--accent)_var(--glow),transparent),transparent)] px-6 py-5`}
      >
        <div>
          <p className="text-sm font-medium text-muted">{monthLabel(ym)}</p>
          <h1 className="text-3xl font-bold tracking-tight">
            {greeting(now.getHours())}
            {username ? `, ${username}` : ""}
          </h1>
          <p className="mt-1 text-sm text-ink2">
            {snapshots.length === 0
              ? "No books yet. Create a book for the household, a parent's accounts, or your own."
              : `${snapshots.length} book${snapshots.length === 1 ? "" : "s"}${all.started < snapshots.length ? `, ${all.started} started this month` : ""}. ${notes.length === 0 ? "Nothing needs your attention." : `${notes.length} thing${notes.length === 1 ? "" : "s"} worth a look.`}`}
          </p>
        </div>
        {canEdit && <CreateSpace />}
      </header>

      {insights.books > 0 && <InsightsBanner insights={insights} />}

      {all.started > 0 && (
        <section aria-label="All books" className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(13rem,1fr))]">
          <Tile icon={MdSavings} label="Total cushion" value={formatMoney(all.cushion)} tone={all.cushion > 0 ? "good" : "bad"} note="Across every started book" />
          <Tile icon={MdAccountBalance} label="In the bank" value={formatMoney(all.bankTotal)} note={`${all.started} book${all.started === 1 ? "" : "s"} this month`} />
          <Tile icon={MdNorthEast} label="Still to pay" value={formatMoney(all.toPay)} note="Bills and one-offs, incl. payments sent" />
          <Tile icon={MdSouthWest} label="Income to arrive" value={formatMoney(all.incomeToArrive)} note="Pending this month" />
        </section>
      )}

      {snapshots.length === 0 ? (
        <p className={`${card} p-6 text-ink2`}>
          {canEdit ? "Use Create book to make your first one." : "Ask an administrator to create a book."}
        </p>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-3">
          <section aria-label="Books" className="lg:col-span-2">
            <div className="mb-2 flex h-9 items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Your books</h2>
              {canEdit && snapshots.length > 1 && <ReorderBooks books={snapshots.map((b) => ({ id: b.id, name: b.name }))} />}
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {snapshots.map((s) => (
                <li key={s.id} className="relative flex">
                  <SpaceCard s={s} ym={ym} />
                  {canEdit && (
                    <div className="absolute right-12 top-5 flex h-9 translate-y-px items-center">
                      <DeleteBook id={s.id} name={s.name} contents={spaceContents(db, s.id)} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section aria-label="Worth a look">
            <div className="mb-2 flex h-9 items-center">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Worth a look</h2>
            </div>
            <div className={`${card} p-4`}>
            {notes.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-ink2">
                <MdCheckCircle className="h-5 w-5 shrink-0 text-good" aria-hidden />
                All clear. No late bills, nothing due in the next few days.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {notes.map((n, i) => {
                  const st = NOTE_STYLE[n.level];
                  return (
                    <li key={i}>
                      <Link
                        href={`/s/${n.spaceId}/${ym}`}
                        className="-mx-2 flex items-start gap-3 rounded-lg px-2 py-2.5 transition hover:bg-surface2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                      >
                        <st.icon className={`mt-0.5 h-5 w-5 shrink-0 ${st.tone}`} aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[0.6875rem] font-semibold uppercase tracking-wider text-muted">{st.label}</span>
                          <span className="block text-sm font-medium">{n.title}</span>
                          <span className="block text-[0.8125rem] text-muted">{n.detail}</span>
                        </span>
                        <MdChevronRight className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function SpaceCard({ s, ym }: { s: SpaceSnapshot; ym: string }) {
  const tone = s.cushion > 0 ? "text-good-bright" : s.cushion < 0 ? "text-bad-bright" : "text-ink";
  return (
    <Link
      href={`/s/${s.id}/${ym}`}
      className={`${card} group flex w-full flex-col gap-3 p-5 transition hover:border-axis focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
        s.started ? "bg-[linear-gradient(135deg,color-mix(in_srgb,var(--accent)_var(--glow),transparent),transparent_65%)]" : ""
      }`}
    >
      <div className="flex items-center gap-3">
        <IconChip icon={MdWallet} />
        <span className="min-w-0 flex-1 truncate text-base font-semibold">{s.name}</span>
        <MdChevronRight className="h-5 w-5 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-ink" aria-hidden />
      </div>

      {s.started ? (
        <>
          <div>
            <div className="text-xs font-medium text-muted">Cushion</div>
            <div className={`text-2xl font-bold leading-8 tracking-tight ${tone}`}>{formatMoney(s.cushion)}</div>
          </div>
          <div>
            <Meter value={s.paidShare} label={`${s.name}: share of this month's spending already paid`} />
            <div className="flex justify-between text-xs text-muted">
              <span>{s.paidShare === null ? "Nothing planned" : `${Math.round(s.paidShare * 100)}% paid`}</span>
              <span>{formatMoney(s.toPay)} to pay</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink2">
            <DueChip s={s} />
            <span className="text-muted">
              {s.accounts} account{s.accounts === 1 ? "" : "s"} · {formatMoney(s.bankTotal)}
            </span>
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col justify-center gap-1 py-2">
          <div className="text-sm font-medium">{monthLabel(ym)} not started</div>
          <div className="text-[0.8125rem] text-muted">Open it to start the month from the last one.</div>
        </div>
      )}
    </Link>
  );
}

function DueChip({ s }: { s: SpaceSnapshot }) {
  const d = s.due;
  if (d.level === "clear") {
    return (
      <span className="inline-flex items-center gap-1 font-medium text-good">
        <MdCheckCircle className="h-4 w-4" aria-hidden />
        Nothing due
      </span>
    );
  }
  const text =
    d.level === "overdue"
      ? `${d.overdueCount} overdue · ${d.name}`
      : d.days === null
        ? `Next · ${d.name}`
        : d.days === 0
          ? `${d.name} due today`
          : `${d.name} in ${d.days} day${d.days === 1 ? "" : "s"}`;
  return (
    <span className={`inline-flex min-w-0 items-center gap-1 font-medium ${d.level === "overdue" ? "text-bad" : "text-ink"}`}>
      {d.level === "overdue" ? <MdWarningAmber className="h-4 w-4 shrink-0" aria-hidden /> : <MdSchedule className="h-4 w-4 shrink-0" aria-hidden />}
      <span className="truncate">{text}</span>
    </span>
  );
}

function InsightsBanner({ insights }: { insights: OverviewInsights }) {
  const { total, warns, top, next, net, books } = insights;
  return (
    <section
      aria-label="Insights"
      className={`${card} insight-pop grid gap-x-8 gap-y-5 !border-accent/50 bg-[linear-gradient(110deg,color-mix(in_srgb,var(--accent)_30%,var(--surface)),color-mix(in_srgb,var(--fill)_22%,var(--surface))_55%,color-mix(in_srgb,var(--series-1)_16%,var(--surface)))] px-6 py-6 shadow-[0_0.75rem_2rem_color-mix(in_srgb,var(--accent)_28%,transparent)] lg:grid-cols-5`}
    >
      <div className="flex flex-col gap-4 lg:col-span-2">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-accent text-accent-ink shadow-card" aria-hidden>
            {total > 0 ? <MdWarningAmber className="h-7 w-7" /> : <MdInsights className="h-7 w-7" />}
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink2">Insights</p>
            <h2 className="text-xl font-bold leading-tight tracking-tight">
              {total === 0 ? "Nothing unusual this month" : `${total} ${total === 1 ? "thing" : "things"} worth a look${warns > 0 ? `, ${warns} to watch` : ""}`}
            </h2>
          </div>
        </div>
        {net !== null && (
          <div className="rounded-xl border border-[color-mix(in_srgb,var(--accent)_28%,transparent)] bg-[color-mix(in_srgb,var(--surface)_55%,transparent)] px-4 py-3">
            <p className="text-sm text-ink2">Typical month, all books</p>
            <p className={`text-3xl font-bold tracking-tight ${net >= 0 ? "text-good-bright" : "text-bad-bright"}`}>
              {net >= 0 ? "+" : "-"}
              {formatMoney(Math.abs(net))}
              <span className="ml-1 text-base font-semibold text-ink2">a month</span>
            </p>
            <p className="text-[0.8125rem] text-ink2">
              Income less spending, across {books} book{books === 1 ? "" : "s"}
              {next ? ` · cushion likely ${formatCompact(next.low)} to ${formatCompact(next.high)} by ${monthLabel(next.ym).split(" ")[0]}` : ""}
            </p>
          </div>
        )}
      </div>

      <div className="lg:col-span-3">
        {top.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-ink2">
            <MdCheckCircle className="h-5 w-5 shrink-0 text-good" aria-hidden />
            Bills and spending look like a usual month in every book.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {top.map((t, i) => (
              <li key={i}>
                <Link
                  href={insightsLink(t.spaceId, { page: "overview" })}
                  className="-mx-2 flex items-start gap-3 rounded-lg px-2 py-2.5 transition hover:bg-surface/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <MdNorthEast className={`mt-0.5 h-5 w-5 shrink-0 ${t.insight.severity === "warn" ? "text-bad" : "text-ink2"}`} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[0.6875rem] font-semibold uppercase tracking-wider text-ink2">
                      <span className="sr-only">{t.insight.severity === "warn" ? "Warning: " : "Note: "}</span>
                      {t.book}
                    </span>
                    <span className="block text-sm font-semibold">{t.insight.title}</span>
                    <span className="block text-[0.8125rem] text-ink2">{t.insight.detail}</span>
                  </span>
                  <MdChevronRight className="mt-0.5 h-5 w-5 shrink-0 text-ink2" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[0.8125rem] text-ink2">Open a book to see its full insights and forecast.</p>
      </div>
    </section>
  );
}
