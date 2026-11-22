import { NextResponse } from "next/server";
import { isYm } from "@/lib/budget/months";
import { currentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { buildWorkbook } from "@/lib/excel/write";
import { findMonthId, getSpace, listMonthRows, loadMonth } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Download a space as .xlsx: every month, or one with ?ym=YYYY-MM. Any signed-in user may export. */
export async function GET(req: Request, { params }: { params: Promise<{ spaceId: string }> }) {
  if (!(await currentUser())) return new NextResponse("Sign in required", { status: 401 });
  const spaceId = Number((await params).spaceId);
  const db = getDb();
  const space = Number.isInteger(spaceId) ? getSpace(db, spaceId) : undefined;
  if (!space) return new NextResponse("Not found", { status: 404 });

  const ym = new URL(req.url).searchParams.get("ym");
  let months;
  if (ym !== null) {
    const id = isYm(ym) ? findMonthId(db, spaceId, ym) : undefined;
    if (id === undefined) return new NextResponse("Not found", { status: 404 });
    months = [{ ym, rows: loadMonth(db, id) }];
  } else {
    months = listMonthRows(db, spaceId);
  }

  const file = await buildWorkbook(months);
  const slug = space.name.replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "") || "barkat";
  const name = `${slug}${ym ? `-${ym}` : ""}.xlsx`;
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
