// Which paths need no session. `/api/auth/*` belongs to Better Auth (see
// app/api/auth/[...all]/route.ts), which checks its own sessions and roles.

export function isPublicPath(path: string): boolean {
  return path === "/api/health" || path === "/api/auth/status" || path.startsWith("/api/auth/");
}
