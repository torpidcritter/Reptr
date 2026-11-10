import { describe, expect, it } from "vitest";
import { OP_MAX_AGE_DAYS, OP_RETENTION_DAYS, tooOldToSend } from "./retention";

describe("queued change retention", () => {
  it("keeps op ids on the server longer than a device sends on its own", () => {
    expect(OP_RETENTION_DAYS).toBeGreaterThan(OP_MAX_AGE_DAYS);
  });

  it("holds back changes queued more than a year ago", () => {
    const now = Date.UTC(2026, 10, 10);
    expect(tooOldToSend(now - 364 * 86_400_000, now)).toBe(false);
    expect(tooOldToSend(now - 366 * 86_400_000, now)).toBe(true);
  });
});
