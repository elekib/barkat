import { notFound } from "next/navigation";
import { MdDownload } from "react-icons/md";
import { BackButton } from "@/components/BackButton";
import { ImportForm } from "@/components/ImportForm";
import { btnGhost, card } from "@/components/ui";
import { currentYm, monthLabel } from "@/lib/budget/months";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getSpace, listMonths } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function FilesPage({ params }: { params: Promise<{ spaceId: string }> }) {
  const me = await requireUser();
  const spaceId = Number((await params).spaceId);
  const db = getDb();
  const space = Number.isInteger(spaceId) ? getSpace(db, spaceId) : undefined;
  if (!space) notFound();
  const months = listMonths(db, spaceId);
  const now = currentYm();

  return (
    <>
      <BackButton href={`/s/${spaceId}/${now}`}>Back to {monthLabel(now)}</BackButton>
      <div className="mb-4">
        <p className="text-sm font-medium text-muted">{space.name}</p>
        <h1 className="text-2xl font-bold tracking-tight">Import and export</h1>
      </div>

      <section className={`${card} mb-3 px-5 py-4`}>
        <h2 className="text-base font-semibold">Full backup</h2>
        <p className="mb-3 mt-0.5 text-sm text-muted">
          Everything in this book in one file: every month, account, bill, one-off, income entry and income schedule, with balances exactly as they are.
          Use it to move the book to another Barkat or to keep a copy. Restore it from Create book on the Books page. Users and settings are not included.
        </p>
        <a href={`/s/${spaceId}/backup`} className={btnGhost}>
          <MdDownload className="mr-1.5 h-4 w-4" aria-hidden />
          Download backup (.json)
        </a>
      </section>

      <section className={`${card} mb-3 px-5 py-4`}>
        <h2 className="text-base font-semibold">Export to Excel</h2>
        <p className="mb-3 mt-0.5 text-sm text-muted">
          One sheet per month in the original sheet&apos;s layout, with its formulas, so the file still calculates in Excel.
          One-off payments sit among the expenses, marked in an extra Kind column.
        </p>
        {months.length === 0 ? (
          <p className="text-sm text-muted">No months to export yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <a href={`/s/${spaceId}/export`} className={btnGhost}>
              <MdDownload className="mr-1.5 h-4 w-4" aria-hidden />
              All {months.length} month{months.length === 1 ? "" : "s"}
            </a>
            {months.slice(0, 6).map((m) => (
              <a key={m} href={`/s/${spaceId}/export?ym=${m}`} className={btnGhost}>
                {monthLabel(m)}
              </a>
            ))}
          </div>
        )}
      </section>

      <section className={`${card} px-5 py-4`}>
        <h2 className="text-base font-semibold">Import months</h2>
        <p className="mb-3 mt-0.5 text-sm text-muted">
          From Excel workbooks or Barkat backups, one file or many, so you can bring in older years: choose a workbook per year (2022.xlsx, 2023.xlsx) and give each its year.
          Each sheet is one month, named like &quot;December&quot;, &quot;December 2026&quot; or &quot;2026-12&quot;; it reads the Expenses table, the Income list and the bank balances.
          A backup (.json) restores its months as they were. Preview shows every month, what it holds and whether it is added, replaced or skipped before anything is written.
          Sheets that are not months are reported and skipped.
        </p>
        <p className="mb-3 text-sm text-muted">
          Months you already have keep their balances: an account&apos;s balance carries from month to month, so when older months go in front, an &quot;Adjustment&quot; entry in the
          last older month makes the books meet, and nothing in your existing months is edited.
        </p>
        {me.user.role === "admin" ? (
          <ImportForm spaceId={spaceId} defaultYear={Number(now.slice(0, 4))} />
        ) : (
          <p className="text-sm text-muted">An administrator can import.</p>
        )}
      </section>
    </>
  );
}
