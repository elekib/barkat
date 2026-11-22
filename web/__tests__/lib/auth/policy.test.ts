import { describe, expect, it } from "vitest";
import { isPublicPath } from "@/lib/auth/policy";

describe("policy", () => {
  it("keeps only health and Better Auth's own routes public", () => {
    for (const p of ["/api/health", "/api/auth/status", "/api/auth/sign-in/username"]) expect(isPublicPath(p)).toBe(true);
    for (const p of ["/api/anything-else", "/api/authx", "/s/1/2026-12"]) expect(isPublicPath(p)).toBe(false);
  });
});
