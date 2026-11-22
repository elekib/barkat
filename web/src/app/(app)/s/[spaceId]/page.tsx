import { notFound, redirect } from "next/navigation";
import { currentYm } from "@/lib/budget/months";
import { getDb } from "@/lib/db";
import { getSpace } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function SpaceIndex({ params }: { params: Promise<{ spaceId: string }> }) {
  const id = Number((await params).spaceId);
  if (!Number.isInteger(id) || !getSpace(getDb(), id)) notFound();
  redirect(`/s/${id}/${currentYm()}`);
}
