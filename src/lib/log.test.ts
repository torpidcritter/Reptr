import { describe, expect, it } from "vitest";
import { formatLine } from "./log";

describe("structured log", () => {
  it("writes one JSON line and masks secrets", () => {
    const line = formatLine("error", "coach_failed", {
      status: 500,
      email: "a@b.c",
      nested: { apiKey: "sk-123", ok: 1 },
      err: new Error("boom"),
    });
    expect(line).not.toContain("\n");
    const o = JSON.parse(line);
    expect(o).toMatchObject({
      level: "error",
      event: "coach_failed",
      status: 500,
      email: "[redacted]",
      nested: { apiKey: "[redacted]", ok: 1 },
      err: { name: "Error", message: "boom" },
    });
  });
});

describe("alerts", async () => {
  const { shouldAlert } = await import("./log");
  it("sends the same error at most once a minute", () => {
    expect(shouldAlert("db_down", 1_000_000)).toBe(true);
    expect(shouldAlert("db_down", 1_030_000)).toBe(false);
    expect(shouldAlert("other_event", 1_030_000)).toBe(true);
    expect(shouldAlert("db_down", 1_061_000)).toBe(true);
  });
});
