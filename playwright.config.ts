import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // Port 3100 never collides with the production container on 3000. The
    // suite runs against its own scratch database (gitignored under data/),
    // migrated with real migrations and seeded from the legacy capture.
    // Never reuse a running server: it may be pointed at the dev database.
    command:
      "npm run db:migrate && npm run import:legacy -- --apply && npm run dev",
    env: { DATABASE_URL: "file:./data/e2e.db" },
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
