import { describe, expect, it } from "vitest";
import { resolveSiteUrl, safeNextPath, SiteUrlError } from "./site-url";

describe("resolveSiteUrl", () => {
  it("uses the configured address, trimmed to its origin", () => {
    expect(
      resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "https://reptr.app/", NODE_ENV: "production" }),
    ).toBe("https://reptr.app");
  });

  it("falls back to Vercel's production domain", () => {
    expect(
      resolveSiteUrl({
        VERCEL_PROJECT_PRODUCTION_URL: "reptr-three.vercel.app",
        NODE_ENV: "production",
      }),
    ).toBe("https://reptr-three.vercel.app");
  });

  it("refuses to run in production without one", () => {
    expect(() => resolveSiteUrl({ NODE_ENV: "production" })).toThrow(SiteUrlError);
  });

  it("refuses plain http and paths in production", () => {
    expect(() =>
      resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "http://reptr.app", NODE_ENV: "production" }),
    ).toThrow();
    expect(() =>
      resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "https://reptr.app/app", NODE_ENV: "production" }),
    ).toThrow();
  });

  it("uses localhost in development", () => {
    expect(resolveSiteUrl({ NODE_ENV: "development" })).toBe("http://localhost:3000");
  });
});

describe("safeNextPath", () => {
  it.each([
    ["/progress", "/progress"],
    ["/workout?x=1", "/workout?x=1"],
    ["https://evil.example", "/"],
    ["//evil.example", "/"],
    ["/\\evil.example", "/"],
    ["", "/"],
    [null, "/"],
  ])("%s -> %s", (input, out) => expect(safeNextPath(input)).toBe(out));
});
