import { describe, expect, it } from "vitest";
import { magicLinkError } from "./errors";

describe("magicLinkError", () => {
  it("tells people to wait when Supabase rate-limits emails", () => {
    expect(magicLinkError({ code: "over_email_send_rate_limit", status: 429 }).kind).toBe(
      "rate_limited",
    );
  });
  it("flags a sender outage as a delivery failure, which is reported", () => {
    expect(magicLinkError({ code: "unexpected_failure", status: 500 }).kind).toBe("delivery");
  });
  it("explains a rejected address", () => {
    expect(magicLinkError({ code: "email_address_invalid", status: 400 }).kind).toBe("invalid");
  });
  it("falls back to a generic message", () => {
    expect(magicLinkError({ status: 400 }).kind).toBe("unknown");
  });
});
