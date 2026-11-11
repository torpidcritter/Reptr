import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, testDatabaseUrl } from "@/db/test/test-db";
import { rateLimits } from "@/db/schema";
import { hit, limits, pruneRateLimits, waitText } from "./rate-limit";

describe("wait text", () => {
  it("reads naturally", () => {
    expect(waitText(40)).toBe("in 40 seconds");
    expect(waitText(400)).toBe("in 7 minutes");
    expect(waitText(20000)).toBe("in 6 hours");
  });
});

describe.skipIf(!testDatabaseUrl)("rate limits", () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  beforeAll(async () => {
    t = await createTestDatabase("ratelimit");
  });
  afterAll(() => t?.close());

  it("allows up to the limit, then blocks with a wait time", async () => {
    const who = randomUUID();
    const results = [];
    for (let i = 0; i <= limits.profileCreate.max; i++)
      results.push(await hit(t.db, "profileCreate", who));
    expect(results.slice(0, limits.profileCreate.max).every((r) => r.ok)).toBe(true);
    const last = results.at(-1)!;
    expect(last.ok).toBe(false);
    if (!last.ok) expect(last.retryAfterSec).toBeGreaterThan(800);
    // Someone else, or another limit, isn't affected.
    expect((await hit(t.db, "profileCreate", randomUUID())).ok).toBe(true);
    expect((await hit(t.db, "export", who)).ok).toBe(true);
  });

  it("starts a fresh window once the old one has passed", async () => {
    const who = randomUUID();
    for (let i = 0; i < limits.export.max; i++) await hit(t.db, "export", who);
    expect((await hit(t.db, "export", who)).ok).toBe(false);
    await t.db
      .update(rateLimits)
      .set({ windowStart: sql`now() - interval '2 hours'` })
      .where(sql`${rateLimits.key} = ${`export:${who}`}`);
    expect((await hit(t.db, "export", who)).ok).toBe(true);
  });

  it("counts correctly under concurrent calls", async () => {
    const who = randomUUID();
    const out = await Promise.all(
      Array.from({ length: limits.photo.max + 5 }, () => hit(t.db, "photo", who)),
    );
    expect(out.filter((r) => r.ok)).toHaveLength(limits.photo.max);
  });

  it("prunes old counters", async () => {
    await t.db
      .insert(rateLimits)
      .values({ key: "old", windowStart: sql`now() - interval '3 days'`, count: 1 });
    await pruneRateLimits(t.db);
    const rows = await t.db
      .select()
      .from(rateLimits)
      .where(sql`${rateLimits.key} = 'old'`);
    expect(rows).toHaveLength(0);
  });
});
