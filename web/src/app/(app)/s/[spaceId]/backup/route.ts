import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/session";
import { exportBook } from "@/lib/backup";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Download a whole book as a Barkat backup (.json) that can be restored as a new book anywhere. */
export async function GET(_req: Request, { params }: { params: Promise<{ spaceId: string }> }) {
  if (!(await currentUser())) return new NextResponse("Sign in required", { status: 401 });
  const spaceId = Number((await params).spaceId);
  const backup = Number.isInteger(spaceId) ? exportBook(getDb(), spaceId) : undefined;
  if (!backup) return new NextResponse("Not found", { status: 404 });

  const slug = backup.book.name.replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "") || "barkat";
  return new NextResponse(JSON.stringify(backup, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${slug}-backup.json"`,
      "Cache-Control": "no-store",
    },
  });
}
