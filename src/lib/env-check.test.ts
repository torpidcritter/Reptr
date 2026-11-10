import { describe, expect, it } from "vitest";
import { assertSafeEnvironment, productionEnvProblems } from "./env-check";

const deployed = {
  VERCEL_ENV: "production",
  NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  DATABASE_URL: "postgres://x",
  NEXT_PUBLIC_SITE_URL: "https://reptr.app",
};

const without = (env: Record<string, string>, name: string) =>
  Object.fromEntries(Object.entries(env).filter(([k]) => k !== name));

describe("production environment check", () => {
  it("allows anything on a developer's machine", () => {
    expect(productionEnvProblems({ REPTR_DEV_USER_ID: "x", REPTR_DEMO: "1" })).toEqual([]);
  });

  it("passes a complete deployment", () => {
    expect(() => assertSafeEnvironment(deployed)).not.toThrow();
  });

  it("refuses a deployment that would sign everyone in as one account", () => {
    for (const name of ["REPTR_DEV_USER_ID", "REPTR_DEMO", "REPTR_LOCAL", "REPTR_E2E"]) {
      expect(() => assertSafeEnvironment({ ...deployed, [name]: "1" })).toThrow(name);
    }
  });

  it("refuses a deployment without Supabase or a database", () => {
    expect(productionEnvProblems(without(deployed, "NEXT_PUBLIC_SUPABASE_URL"))).toEqual([
      "NEXT_PUBLIC_SUPABASE_URL is not set.",
    ]);
    expect(productionEnvProblems(without(deployed, "DATABASE_URL"))).toEqual([
      "DATABASE_URL is not set.",
    ]);
  });

  it("refuses local-only settings in previews too, but lets previews skip the database", () => {
    expect(productionEnvProblems({ VERCEL_ENV: "preview", REPTR_DEMO: "1" })).toHaveLength(1);
    expect(productionEnvProblems({ VERCEL_ENV: "preview" })).toEqual([]);
  });

  it("needs a site address in production but not in previews", () => {
    const rest = without(deployed, "NEXT_PUBLIC_SITE_URL");
    expect(productionEnvProblems(rest)).toHaveLength(1);
    expect(productionEnvProblems({ ...rest, VERCEL_ENV: "preview" })).toEqual([]);
    expect(
      productionEnvProblems({ ...rest, VERCEL_PROJECT_PRODUCTION_URL: "r.vercel.app" }),
    ).toEqual([]);
  });
});
