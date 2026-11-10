import { describe, expect, it } from "vitest";
import { backoffMs, classifyThrown, isRetryable, needsPerson } from "./errors";

describe("sync errors", () => {
  it("retries only failures that clear up on their own", () => {
    expect(isRetryable("network")).toBe(true);
    expect(isRetryable("server_transient")).toBe(true);
    expect(isRetryable("rate_limited")).toBe(true);
    expect(isRetryable("validation")).toBe(false);
    expect(isRetryable("conflict")).toBe(false);
    expect(isRetryable("stale_build")).toBe(false);
  });

  it("waits for the person on auth, conflicts and old app versions", () => {
    expect(needsPerson("auth")).toBe(true);
    expect(needsPerson("conflict")).toBe(true);
    expect(needsPerson("stale_build")).toBe(true);
    expect(needsPerson("network")).toBe(false);
  });

  it("backs off exponentially with jitter, capped at five minutes", () => {
    const mid = () => 0.5;
    expect(backoffMs(0, mid)).toBe(2000);
    expect(backoffMs(3, mid)).toBe(16000);
    expect(backoffMs(30, mid)).toBe(300000);
    expect(backoffMs(0, () => 0)).toBe(1500);
    expect(backoffMs(0, () => 1)).toBe(2500);
  });

  it("recognizes a server action that no longer exists after a deployment", () => {
    expect(classifyThrown(new Error('Server Action "abc123" was not found on the server.'))).toBe(
      "stale_build",
    );
    expect(
      classifyThrown(
        new Error(
          'Failed to find Server Action "x". This request might be from an older or newer deployment.',
        ),
      ),
    ).toBe("stale_build");
  });

  it("treats fetch failures as offline and anything else as a brief server problem", () => {
    expect(classifyThrown(new TypeError("Failed to fetch"))).toBe("network");
    expect(classifyThrown(new Error("Load failed"))).toBe("network");
    expect(classifyThrown(new Error("boom"))).toBe("server_transient");
  });
});
