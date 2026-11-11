// Settings that only make sense on a developer's machine must never reach a real
// deployment: REPTR_DEV_USER_ID or REPTR_DEMO would sign every visitor in as one
// account. A production deployment with any of them, or without Supabase, refuses to
// start instead of quietly running that way.

type Env = Record<string, string | undefined>;

/** True for Vercel production and preview deployments (anything not on a dev machine). */
export const isDeployed = (env: Env) => Boolean(env.VERCEL_ENV) || env.REPTR_DEPLOYED === "1";

/** Problems that make this environment unsafe to serve real people. Empty when fine. */
export function productionEnvProblems(env: Env): string[] {
  if (!isDeployed(env)) return [];
  const problems: string[] = [];
  for (const name of ["REPTR_DEV_USER_ID", "REPTR_DEMO", "REPTR_LOCAL", "REPTR_E2E"]) {
    if (env[name]) problems.push(`${name} is set; it is for local use only. Remove it.`);
  }
  if (env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY)
    problems.push(
      "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY is set, which would send the key to browsers. Rename it SUPABASE_SERVICE_ROLE_KEY.",
    );
  // Previews may run without a database; production can't.
  const production = env.VERCEL_ENV === "production" || env.REPTR_DEPLOYED === "1";
  if (!production) return problems;
  for (const name of [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "DATABASE_URL",
  ]) {
    if (!env[name]) problems.push(`${name} is not set.`);
  }
  return problems;
}

export class UnsafeEnvironmentError extends Error {
  constructor(problems: string[]) {
    super(`Refusing to start: ${problems.join(" ")}`);
    this.name = "UnsafeEnvironmentError";
  }
}

/** Throws when the environment is unsafe. Called once when the server starts. */
export function assertSafeEnvironment(env: Env = process.env) {
  const problems = productionEnvProblems(env);
  if (problems.length) throw new UnsafeEnvironmentError(problems);
}
