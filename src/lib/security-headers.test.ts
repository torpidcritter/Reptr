import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, securityHeaders } from "./security-headers";

const env = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
  NODE_ENV: "production",
  VERCEL_ENV: "production",
};

describe("security headers", () => {
  it("only lets the page talk to itself and Supabase", () => {
    const csp = contentSecurityPolicy(env);
    expect(csp).toContain("connect-src 'self' https://abc.supabase.co wss://abc.supabase.co");
    expect(csp).toContain("img-src 'self' data: blob: https://abc.supabase.co");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain("unsafe-eval");
  });

  it("allows the dev server's tooling only in development", () => {
    const csp = contentSecurityPolicy({ NODE_ENV: "development" });
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });

  it("works without Supabase configured", () => {
    expect(contentSecurityPolicy({})).toContain("connect-src 'self';");
  });

  it("forces HTTPS only on a real deployment, not the laptop install", () => {
    const names = (e: Record<string, string>) => securityHeaders(e).map((h) => h.key);
    expect(names(env)).toContain("Strict-Transport-Security");
    expect(contentSecurityPolicy(env)).toContain("upgrade-insecure-requests");
    const laptop = { NODE_ENV: "production", REPTR_LOCAL: "1" };
    expect(names(laptop)).not.toContain("Strict-Transport-Security");
    expect(contentSecurityPolicy(laptop)).not.toContain("upgrade-insecure-requests");
  });
});
