// Runs once when the Next.js server starts: opens the database (running any
// migrations) and prints the one-time setup code if no accounts exist yet.

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { getAccounts } = await import("@/lib/auth");
  getAccounts();
}
