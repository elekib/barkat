// The signed-in user for server components and server actions.

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from ".";
import { ROLE_RANK, toAuthUser, type AuthUser, type Role } from "./accounts";

/** The signed-in user, or null. */
export async function currentUser(): Promise<AuthUser | null> {
  return toAuthUser(await getAuth().api.getSession({ headers: await headers() }));
}

/** The signed-in user with at least `role`; otherwise redirect (to sign-in, or home for a role that is too low). */
export async function requireUser(role: Role = "viewer"): Promise<AuthUser> {
  const me = await currentUser();
  if (!me) redirect("/login");
  if (ROLE_RANK[me.user.role] < ROLE_RANK[role]) redirect("/");
  return me;
}

/** For server actions: the user, or null when they may not make changes. Never redirects. */
export async function adminOrNull(): Promise<AuthUser | null> {
  const me = await currentUser();
  return me && ROLE_RANK[me.user.role] >= ROLE_RANK.admin ? me : null;
}
