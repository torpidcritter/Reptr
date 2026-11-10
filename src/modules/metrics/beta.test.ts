import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, testDatabaseUrl } from "@/db/test/test-db";
import { follow, saveProfile } from "@/modules/social/social";
import { emptyWorkout } from "@/modules/workouts/start";
import { saveWorkoutSnapshot } from "@/modules/workouts/workouts";
import { countSync } from "@/modules/sync/stats";
import { betaMetrics } from "./beta";

describe.skipIf(!testDatabaseUrl)("beta metrics", () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  const mod = randomUUID();
  const old = randomUUID();
  const fresh = randomUUID();

  beforeAll(async () => {
    t = await createTestDatabase("metrics");
    for (const u of [mod, old, fresh]) await t.addUser(u);
    process.env.REPTR_MODERATOR_IDS = mod;
    // `old` signed up 40 days ago and trained today; `fresh` signed up today.
    await t.sql`update profiles set created_at = now() - interval '40 days' where user_id = ${old}`;
    const w = emptyWorkout();
    w.status = "completed";
    w.startedAt = new Date(Date.now() - 3600_000).toISOString();
    w.finishedAt = new Date().toISOString();
    await saveWorkoutSnapshot(t.db, old, w);
    await saveProfile(t.db, old, { handle: "old", visibility: "public" });
    await saveProfile(t.db, fresh, { handle: "fresh", visibility: "public" });
    await t.sql`update social_profiles set leaderboards = true where user_id = ${old}`;
    await follow(t.db, fresh, old);
    await countSync(t.db, "workout", "ok");
    await countSync(t.db, "workout", "ok");
    await countSync(t.db, "workout", "server_transient");
    await countSync(t.db, "outbox", "conflict");
  });
  afterAll(() => t?.close());

  it("counts activity, retention, social reach and sync health for moderators only", async () => {
    await expect(betaMetrics(t.db, old)).rejects.toThrow(/moderators/);
    const m = await betaMetrics(t.db, mod);
    expect(m.accounts).toBeGreaterThanOrEqual(3);
    expect(m.weeklyActive).toBe(1);
    expect(m.weeks).toHaveLength(5);
    expect(m.weeks.at(-1)).toMatchObject({ activeUsers: 1, workouts: 1 });
    // Only `old` is old enough for every cohort, and trained after day 30.
    expect(m.retention.find((r) => r.day === 30)).toEqual({ day: 30, cohort: 1, retained: 1 });
    expect(m.socialProfiles).toBe(2);
    expect(m.onLeaderboards).toBe(1);
    expect(m.followsPerProfile).toBe(0.5);
    expect(m.sync).toEqual([
      { channel: "outbox", ok: 0, conflicts: 1, failed: 0 },
      { channel: "workout", ok: 2, conflicts: 0, failed: 1 },
    ]);
  });
});
