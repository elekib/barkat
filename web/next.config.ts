import type { NextConfig } from "next";

// Next.js needs inline scripts and styles for hydration, so the CSP allows
// them; the rest is locked to this origin. Dev also needs eval and websockets.
const dev = process.env.NODE_ENV !== "production";
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${dev ? " ws: wss:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const config: NextConfig = {
  // Self-contained server bundle for the Docker image.
  output: "standalone",
  outputFileTracingExcludes: { "*": ["./__tests__/**/*"] },
  poweredByHeader: false,
  // exceljs is Node-only and large; load it from node_modules instead of bundling it.
  serverExternalPackages: ["exceljs"],
  experimental: { serverActions: { bodySizeLimit: "40mb" } },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default config;
