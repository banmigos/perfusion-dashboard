import { defineConfig, devices } from "@playwright/test";

// Smoke tests against the DEPLOYED app, run from a tailnet client. There is no
// webServer: nothing is started locally. Only read-only specs are included —
// personal.spec.ts and verify.spec.ts create and modify rows, which must never
// happen against the live database.
//
//   PERFUSION_LIVE_URL=https://perfusion.banmigos.dev npm run test:e2e:live
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: ["smoke.spec.ts", "programs.spec.ts"],
  fullyParallel: true,
  retries: 1,
  reporter: "list",
  use: {
    baseURL: process.env.PERFUSION_LIVE_URL ?? "https://perfusion.banmigos.dev",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium-live",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
