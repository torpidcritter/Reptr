// Shared by the Playwright config and the global setup.
const base = new URL(
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/reptr_test",
);
base.pathname = `${base.pathname}_e2e`;

export const e2eDatabaseUrl = base.toString();
export const e2eUserId = "00000000-0000-4000-8000-0000000000e2";
export const e2ePort = Number(process.env.E2E_PORT ?? 3200);
