export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    ok: true,
    version: process.env.BARKAT_VERSION ?? "dev",
    revision: process.env.BARKAT_GIT_SHA ?? "unknown",
  });
}
