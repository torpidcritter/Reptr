import { describe, expect, it } from "vitest";
import { zonedInstant } from "./zoned";

describe("zonedInstant", () => {
  it("turns a local reading into the real instant", () => {
    expect(zonedInstant("2026-11-10", "07:30", "Asia/Kolkata").toISOString()).toBe(
      "2026-11-10T02:00:00.000Z",
    );
    expect(zonedInstant("2026-11-10", "07:30", "UTC").toISOString()).toBe(
      "2026-11-10T07:30:00.000Z",
    );
    expect(zonedInstant("2026-07-01", "23:15", "America/New_York").toISOString()).toBe(
      "2026-07-02T03:15:00.000Z",
    );
  });

  it("handles daylight-saving changes", () => {
    // London, 29 March 2026: clocks go from 01:00 to 02:00.
    expect(zonedInstant("2026-03-29", "00:30", "Europe/London").toISOString()).toBe(
      "2026-03-29T00:30:00.000Z",
    );
    expect(zonedInstant("2026-03-29", "03:00", "Europe/London").toISOString()).toBe(
      "2026-03-29T02:00:00.000Z",
    );
  });
});
