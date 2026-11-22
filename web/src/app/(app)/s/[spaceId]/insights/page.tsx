import { notFound } from "next/navigation";
import { MdInsights, MdNorthEast, MdSouthEast, MdTrendingUp, MdWarningAmber } from "react-icons/md";
import { BackButton } from "@/components/BackButton";
import { Collapsible } from "@/components/Collapsible";
import { IconChip } from "@/components/IconChip";
import { Tile } from "@/components/charts/Charts";
import { card } from "@/components/ui";
import { insightMonths, insightReport, insightsBack, MIN_FORECAST } from "@/lib/budget/insights";
import { formatMoney } from "@/lib/budget/money";
import { currentYm, monthLabel } from "@/lib/budget/months";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getSpace, listMonthRows, listMonthSizes } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function InsightsPage({ params, searchParams }: { params: Promise<{ spaceId: string }>; searchParams: Promise<{ from?: string; ym?: string; year?: string }> }) {
  await requireUser();
  const spaceId = Number((await params).spaceId);
  const db = getDb();
  const space = Number.isInteger(spaceId) ? getSpace(db, spaceId) : undefined;
  if (!space) notFound();

  const rows = listMonthRows(db, spaceId);
  const sizes = new Map(listMonthSizes(db, spaceId).map((s) => [s.ym, s.items]));
  const months = insightMonths(
    rows.map(({ ym, rows: r }) => ({ ym, bills: r.bills, adHoc: r.adHoc, incomes: r.incomes, banks: r.banks.map((b) => b.organic + b.made) })),
    sizes,
  );
  const now = currentYm();
  const report = insightReport(months, now);
  const net = report.averageNet;

  const back = insightsBack(spaceId, await searchParams, report.latest ?? now);

  return (
    <>
      <BackButton href={back.href}>{back.label}</BackButton>
      <div className="z-[15] md:sticky md:top-[var(--nav-h,3.5rem)] -mx-4 mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-line bg-page px-4 py-2.5">
        <div>
          <p className="text-sm font-medium text-muted">{space.name}</p>
          <h1 className="text-xl font-semibold">Insights</h1>
        </div>
      </div>

      {report.latest === null || report.basis < MIN_FORECAST ? (
        <section className={`${card} mx-auto max-w-xl px-6 py-14 text-center`}>
          <h2 className="mb-2 text-xl font-semibold">Not enough history yet</h2>
          <p className="mx-auto text-sm text-muted">Insights compare this month with earlier ones. They start once the book has {MIN_FORECAST} months with data.</p>
        </section>
      ) : (
        <>
          <section aria-label="Outlook" className="mb-3 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(13rem,1fr))]">
            <Tile
              icon={MdTrendingUp}
              label="Typical month"
              value={`${net! >= 0 ? "" : "-"}${formatMoney(Math.abs(net!))}`}
              tone={net! >= 0 ? "good" : "bad"}
              note={`Income less spending, averaged over the last ${report.basis} months`}
            />
            {report.forecast.map((f) => (
              <Tile
                key={f.ym}
                icon={MdInsights}
                label={`Cushion, ${monthLabel(f.ym)}`}
                value={`${f.expected < 0 ? "-" : ""}${formatMoney(Math.abs(f.expected))}`}
                tone={f.expected < 0 ? "bad" : undefined}
                note={`Likely between ${formatMoney(f.low)} and ${formatMoney(f.high)}`}
              />
            ))}
          </section>

          <Collapsible
            id="insights-list"
            stacked
            chip={<IconChip icon={MdWarningAmber} />}
            title={`Worth a look in ${monthLabel(report.latest)}`}
            sub="Found by comparing with your earlier months. Nothing leaves this server."
            pad="md"
            className={`${card} mb-3`}
          >
            {report.insights.length === 0 ? (
              <p className="text-sm text-muted">Nothing stands out. Bills and spending look like a usual month.</p>
            ) : (
              <ul className="grid gap-3">
                {report.insights.map((i, n) => (
                  <li key={`${i.kind}-${n}`} className="flex gap-3 text-sm">
                    <span className={`mt-0.5 ${i.severity === "warn" ? "text-bad" : "text-ink2"}`} aria-hidden>
                      {i.severity === "warn" ? <MdNorthEast className="h-5 w-5" /> : <MdSouthEast className="h-5 w-5" />}
                    </span>
                    <div>
                      <p className="font-medium">
                        <span className="sr-only">{i.severity === "warn" ? "Warning: " : "Note: "}</span>
                        {i.title}
                      </p>
                      <p className="text-muted">{i.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-[0.8125rem] text-muted">
              Forecasts add the typical monthly net to the latest cushion. They are a rough guide, not a promise: one-off costs and late pay will move them.
            </p>
          </Collapsible>
        </>
      )}
    </>
  );
}
