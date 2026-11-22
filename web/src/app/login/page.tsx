import { redirect } from "next/navigation";
import { LoginScreen } from "@/components/screens/LoginScreen";
import { SetupScreen } from "@/components/screens/SetupScreen";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getAccounts } from "@/lib/auth";
import { currentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ changed?: string }> }) {
  if (await currentUser()) redirect("/");
  const setupRequired = getAccounts().setupRequired();
  const { changed } = await searchParams;
  return (
    <main className="relative flex min-h-screen items-center justify-center p-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      {setupRequired ? (
        <SetupScreen />
      ) : (
        <LoginScreen notice={changed ? "Password changed. Sign in again with the new password." : null} />
      )}
    </main>
  );
}
