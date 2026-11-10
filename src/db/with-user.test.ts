import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditLog, bodyMetrics, exercises, rateLimits, workouts } from "./schema";
import { createTestDatabase, testDatabaseUrl } from "./test/test-db";
import { withUser } from "./with-user";

// Row-level security as a second line of defence: the same policies Supabase enforces,
// exercised through withUser against a real Postgres.

/** Drizzle wraps the Postgres error; the reason is on the cause. */
const reason = (p: Promise<unknown>) =>
  p.then(
    () => "no error",
    (e: { message: string; cause?: { message?: string } }) => e.cause?.message ?? e.message,
  );

describe.skipIf(!testDatabaseUrl)("row-level security through withUser", () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  const a = randomUUID();
  const b = randomUUID();

  beforeAll(async () => {
    t = await createTestDatabase("with_user");
    await t.addUser(a);
    await t.addUser(b);
    await t.db.insert(workouts).values([
      { userId: a, name: "A's session", status: "active" },
      { userId: b, name: "B's session", status: "active" },
    ]);
    await t.db.insert(bodyMetrics).values({ userId: b, type: "weight", value: 80 });
  });
  afterAll(() => t?.close());

  it("sees only the user's own rows even without a where clause", async () => {
    const rows = await withUser(t.db, a, (tx) => tx.select().from(workouts));
    expect(rows.map((r) => r.name)).toEqual(["A's session"]);
    expect(await withUser(t.db, a, (tx) => tx.select().from(bodyMetrics))).toEqual([]);
  });

  it("can read shared reference data", async () => {
    const lib = await withUser(t.db, a, (tx) =>
      tx.select({ id: exercises.id }).from(exercises).limit(1),
    );
    expect(lib).toHaveLength(1);
  });

  it("can't write rows for someone else", async () => {
    expect(
      await reason(
        withUser(t.db, a, (tx) =>
          tx
            .insert(workouts)
            .values({ userId: b, name: "forged", status: "completed", finishedAt: new Date() }),
        ),
      ),
    ).toMatch(/row-level security/);
    const changed = await withUser(t.db, a, (tx) =>
      tx.update(workouts).set({ name: "renamed" }).where(eq(workouts.userId, b)).returning(),
    );
    expect(changed).toEqual([]);
  });

  it("can read but not write the audit log, and can't touch rate limits", async () => {
    await t.db.insert(auditLog).values({ userId: a, action: "signed_in" });
    expect(await withUser(t.db, a, (tx) => tx.select().from(auditLog))).toHaveLength(1);
    expect(
      await reason(
        withUser(t.db, a, (tx) => tx.insert(auditLog).values({ userId: a, action: "forged" })),
      ),
    ).toMatch(/row-level security|permission denied/);
    expect(await withUser(t.db, a, (tx) => tx.select().from(rateLimits))).toEqual([]);
  });

  it("leaves no role or identity behind on the connection", async () => {
    await withUser(t.db, a, async () => {});
    const [row] = await t.db.execute<{ role: string; sub: string | null }>(
      sql`select current_user as role, nullif(current_setting('request.jwt.claim.sub', true), '') as sub`,
    );
    expect(row.role).not.toBe("authenticated");
    expect(row.sub).toBeNull();
  });
});
