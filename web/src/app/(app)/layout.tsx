import type { ReactNode } from "react";
import { MobileNav, NavBar } from "@/components/NavBar";
import { ToastProvider } from "@/components/Toast";
import { currentYm } from "@/lib/budget/months";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { listSpaces } from "@/lib/store";

export const dynamic = "force-dynamic";

const version = process.env.BARKAT_VERSION ?? "dev";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user } = await requireUser();
  // node:sqlite rows have null prototypes; client components need plain objects.
  const spaces = listSpaces(getDb()).map((s) => ({ id: s.id, name: s.name }));
  return (
    <ToastProvider>
      <NavBar spaces={spaces} ym={currentYm()} username={user.username} role={user.role} version={version} />
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-5 md:pb-12">{children}</main>
      <MobileNav isAdmin={user.role === "admin"} />
    </ToastProvider>
  );
}
