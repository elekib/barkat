import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Runs scripts/*.seed.ts with the same "@/" alias as the tests. Used by `npm run seed:demo`.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["scripts/**/*.seed.ts"], testTimeout: 300_000 },
});
