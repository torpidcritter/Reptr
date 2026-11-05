import { defineConfig, devices } from "@playwright/test";
import { e2eDatabaseUrl, e2ePort as port, e2eUserId } from "./e2e/env";

// End-to-end journeys against a real Next.js server and a fresh Postgres database.
// Needs TEST_DATABASE_URL (the same throwaway Postgres the unit tests use). The app runs
// in dev mode signed in as a fixed local user, so no Supabase project is needed.

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "retain-on-failure",
    timezoneId: "UTC",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, grepInvert: /@phone/ },
    { name: "phone", use: { ...devices["Pixel 7"] }, grep: /@phone/ },
  ],
  webServer: {
    command: `pnpm exec next dev -p ${port}`,
    port,
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
    env: {
      DATABASE_URL: e2eDatabaseUrl,
      REPTR_DEV_USER_ID: e2eUserId,
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
    },
  },
});
