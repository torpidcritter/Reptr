import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";

/**
 * A hash of the visitor's network address, for rate limits on things anyone can do
 * without a profile (creating one, trying a profile key). The address itself is never
 * stored. On Vercel these headers are set by the platform, not the client.
 */
export async function clientIpKey() {
  const h = await headers();
  const ip = h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  return createHash("sha256").update(`reptr-ip:${ip}`).digest("hex").slice(0, 32);
}
