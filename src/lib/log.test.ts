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
