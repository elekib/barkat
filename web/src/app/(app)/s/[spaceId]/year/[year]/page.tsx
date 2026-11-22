import Link from "next/link";
import { notFound } from "next/navigation";
import { MdAccountBalanceWallet, MdBarChart, MdChevronLeft, MdChevronRight, MdEvent, MdSavings, MdSouthWest, MdNorthEast, MdTableChart } from "react-icons/md";
import { Collapsible } from "@/components/Collapsible";
import { IconChip } from "@/components/IconChip";
import { Tile } from "@/components/charts/Charts";
import { YearChart } from "@/components/charts/YearChart";
import { YearPicker } from "@/components/YearPicker";
import { card } from "@/components/ui";
import { formatMoney } from "@/lib/budget/money";
import { currentYm, monthLabel } from "@/lib/budget/months";
import { isYear, yearInputs, yearView, yearsWithData, type YearMonth } from "@/lib/budget/year";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getSpace, listMonthRows, listMonthSizes } from "@/lib/store";

export const dynamic = "force-dynamic";

const navBtn =
  "grid h-9 min-w-9 place-items-center rounded-lg border border-line bg-surface text-lg leading-none text-ink2 transition hover:bg-surface2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent";

/** A signed amount with an arrow as well as a colour, so a gain and a loss never differ by colour alone. */
function Signed({ cents, bright = false }: { cents: number; bright?: boolean }) {
  if (cents === 0) return <span className="text-muted">{formatMoney(0)}</span>;
  const up = cents > 0;
  return (
    <span className={up ? (bright ? "text-good-bright" : "text-good") : bright ? "text-bad-bright" : "text-bad"}>
      {up ? "▲ " : "▼ "}
      {formatMoney(Math.abs(cents))}
    </span>
  );
}

export default async function YearPage({ params }: { params: Promise<{ spaceId: string; year: string }> }) {
  await requireUser();
  const p = await params;
  const spaceId = Number(p.spaceId);
  const db = getDb();
  const space = Number.isInteger(spaceId) ? getSpace(db, spaceId) : undefined;
  if (!space || !isYear(p.year)) notFound();
  const year = Number(p.year);
  const now = currentYm();

  // The cushion here leaves out admin overrides, like the trend: a correction is not income or spending.
  const rows = listMonthRows(db, spaceId);
  const sizes = new Map(listMonthSizes(db, spaceId).map((s) => [s.ym, s.items]));
  const inputs = yearInputs(
    rows.map(({ ym, rows: r }) => ({ ym, bills: r.bills, adHoc: r.adHoc, incomes: r.incomes, banks: r.banks.map((b) => b.organic + b.made) })),
    sizes,
  );
  const view = yearView(inputs, year);
  const others = yearsWithData(inputs);
  const first = others[others.length - 1] ?? year;
  const lastYear = others[0] ?? year;
  const monthsIn = (y: number) => rows.filter((r) => r.ym.startsWith(`${y}-`)).length;
  const choices = [...new Set([...others, year, Number(now.slice(0, 4))])].sort((a, b) => b - a).map((y) => ({ year: y, months: monthsIn(y) }));
  const monthNow =view.last ?? (String(year) === now.slice(0, 4) ? now : `${year}-01`);
  const gain = view.totals.saved >= 0;
  const avg = view.average;
  const tableId = "year-table";

  return (
    <>
      <div className="z-[15] md:sticky md:top-[var(--nav-h,3.5rem)] -mx-4 mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-line bg-page px-4 py-2.5">
        <div>
          <p className="text-sm font-medium text-muted">{space.name}</p>
          <YearPicker spaceId={spaceId} year={year} thisYear={Number(now.slice(0, 4))} years={choices} />
        </div>
        <nav aria-label="Year" className="flex flex-wrap items-end gap-1">
          <Link href={`/s/${spaceId}/${monthNow}`} className="mr-2 inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm font-medium text-ink2 transition hover:bg-surface2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
            <MdEvent className="h-5 w-5" aria-hidden />
            {monthLabel(monthNow)}
          </Link>
          <Link href={`/s/${spaceId}/year/${year - 1}`} aria-label={`Previous year, ${year - 1}`} className={navBtn}>
            <MdChevronLeft className="h-5 w-5" />
          </Link>
          {String(year) !== now.slice(0, 4) && (
            <Link href={`/s/${spaceId}/year/${now.slice(0, 4)}`} className={`${navBtn} px-3 text-sm font-medium`}>
              This year
            </Link>
          )}
          <Link href={`/s/${spaceId}/year/${year + 1}`} aria-label={`Next year, ${year + 1}`} className={navBtn}>
            <MdChevronRight className="h-5 w-5" />
          </Link>
        </nav>
      </div>

      {view.counted === 0 ? (
        <section className={`${card} mx-auto max-w-xl px-6 py-14 text-center`}>
          <h2 className="mb-2 text-xl font-semibold">Nothing recorded in {year}</h2>
          <p className="mx-auto mb-5 text-sm text-muted">
            {others.length > 0
              ? `This book has months from ${first} to ${lastYear}. Open one of those years, or import ${year} from Import and export.`
              : "This book has no months with data yet."}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {others.slice(0, 6).map((y) => (
              <Link key={y} href={`/s/${spaceId}/year/${y}`} className="inline-flex h-9 items-center rounded-lg border border-line bg-surface px-3 text-sm font-medium text-ink2 hover:bg-surface2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
                {y}
              </Link>
            ))}
            <Link href={`/s/${spaceId}/files`} className="inline-flex h-9 items-center rounded-lg border border-line bg-surface px-3 text-sm font-medium text-accent hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
              Import and export
            </Link>
          </div>
        </section>
      ) : (
        <>
          <section aria-label={`${year} in numbers`} className="mb-3 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(13rem,1fr))]">
            <Tile icon={MdSouthWest} label="Income" value={formatMoney(view.totals.income)} note={avg ? `${formatMoney(avg.income)} in an average month` : undefined} />
            <Tile icon={MdNorthEast} label="Spending" value={formatMoney(view.totals.spending)} note={avg ? `${formatMoney(avg.spending)} in an average month` : undefined} />
            <Tile
              icon={MdSavings}
              label="Saved"
              value={`${gain ? "" : "-"}${formatMoney(Math.abs(view.totals.saved))}`}
              tone={gain ? "good" : "bad"}
              note={`${view.savingsRate === null ? "No income" : `${Math.round(view.savingsRate * 100)}% of income`}${avg ? ` · ${avg.saved >= 0 ? "" : "-"}${formatMoney(Math.abs(avg.saved))} a month` : ""}`}
            />
            <Tile
              icon={MdAccountBalanceWallet}
              label="Cushion at year end"
              value={view.totals.cushion === null ? "–" : formatMoney(view.totals.cushion)}
              tone={view.totals.cushion === null ? undefined : view.totals.cushion > 0 ? "good" : "bad"}
              note={view.last ? `As of ${monthLabel(view.last)}` : undefined}
            />
          </section>

          <Collapsible
            id="year-chart"
            stacked
            chip={<IconChip icon={MdBarChart} />}
            title="Income and spending by month"
            sub={`${view.counted} of 12 months have data${view.counted < 12 ? ". Months with none are left out of the totals" : ""}. Select a month to open it.`}
            pad="md"
            className={`${card} mb-3`}
          >
            <YearChart view={view} spaceId={spaceId} describedBy={tableId} />
          </Collapsible>

          <Collapsible
            id="year-table"
            stacked
            chip={<IconChip icon={MdTableChart} />}
            title="Month by month"
            sub="Saved is income less planned spending. The cushion is what the month was expected to end with. Adjustment entries are corrections and count in the cushion, not in income or spending."
            pad="md"
            className={`${card} mb-3`}
          >
            <div className="overflow-x-auto">
              <table id={tableId} className="w-full min-w-[34rem] border-collapse text-sm tabular-nums">
                <caption className="sr-only">{`${year} by month: income, spending, saved and end-of-month cushion`}</caption>
                <thead>
                  <tr className="border-b border-line text-[0.6875rem] font-semibold uppercase tracking-wider text-muted">
                    <th scope="col" className="py-2 pr-3 text-left">Month</th>
                    <th scope="col" className="px-2 py-2 text-right">Income</th>
                    <th scope="col" className="px-2 py-2 text-right">Spending</th>
                    <th scope="col" className="px-2 py-2 text-right">Saved</th>
                    <th scope="col" className="py-2 pl-2 text-right">Cushion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {view.months.map((m) => (
                    <MonthRow key={m.ym} m={m} spaceId={spaceId} />
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-axis font-semibold">
                  <tr>
                    <th scope="row" className="py-2 pr-3 text-left">Total</th>
                    <td className="px-2 py-2 text-right">{formatMoney(view.totals.income)}</td>
                    <td className="px-2 py-2 text-right">{formatMoney(view.totals.spending)}</td>
                    <td className="px-2 py-2 text-right"><Signed cents={view.totals.saved} /></td>
                    <td className="py-2 pl-2 text-right">{view.totals.cushion === null ? "–" : <Signed cents={view.totals.cushion} />}</td>
                  </tr>
                  {avg && (
                    <tr className="font-medium text-ink2">
                      <th scope="row" className="py-1.5 pr-3 text-left">Average month</th>
                      <td className="px-2 py-1.5 text-right">{formatMoney(avg.income)}</td>
                      <td className="px-2 py-1.5 text-right">{formatMoney(avg.spending)}</td>
                      <td className="px-2 py-1.5 text-right"><Signed cents={avg.saved} /></td>
                      <td className="py-1.5 pl-2 text-right">{avg.cushion === null ? "–" : <Signed cents={avg.cushion} />}</td>
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>
            <p className="mt-2 text-[0.8125rem] text-muted">
              The total cushion is the last month with data, since a cushion is a position and not a flow. The average month counts the {view.counted} month
              {view.counted === 1 ? "" : "s"} with data.
            </p>
          </Collapsible>
        </>
      )}
    </>
  );
}

function MonthRow({ m, spaceId }: { m: YearMonth; spaceId: number }) {
  const link = (
    <Link href={`/s/${spaceId}/${m.ym}`} className="rounded font-medium text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
      {monthLabel(m.ym).split(" ")[0]}
    </Link>
  );
  if (m.status !== "data") {
    return (
      <tr className="text-muted">
        <th scope="row" className="py-1.5 pr-3 text-left font-normal">{link}</th>
        <td colSpan={4} className="px-2 py-1.5 text-right">{m.status === "empty" ? "Started, nothing in it" : "Not started"}</td>
      </tr>
    );
  }
  return (
    <tr>
      <th scope="row" className="py-1.5 pr-3 text-left font-normal">{link}</th>
      <td className="px-2 py-1.5 text-right">{formatMoney(m.income)}</td>
      <td className="px-2 py-1.5 text-right">{formatMoney(m.spending)}</td>
      <td className="px-2 py-1.5 text-right"><Signed cents={m.saved} /></td>
      <td className="py-1.5 pl-2 text-right">{m.cushion === null ? "–" : <Signed cents={m.cushion} />}</td>
    </tr>
  );
}
