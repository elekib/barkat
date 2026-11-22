import { getDb } from "@/lib/db";
import { Accounts } from "./accounts";
import { createAuth, type Auth } from "./auth";

declare global {
  var __barkatAccounts: Accounts | undefined;
}

/** The process-wide account service. Prints the setup code on first use if needed. */
export function getAccounts(): Accounts {
  if (!globalThis.__barkatAccounts) {
    const db = getDb();
    const accounts = new Accounts(createAuth(db), db);
    accounts.start();
    globalThis.__barkatAccounts = accounts;
  }
  return globalThis.__barkatAccounts;
}

/** The Better Auth instance (its `handler` and `api`). */
export const getAuth = (): Auth => getAccounts().auth;
