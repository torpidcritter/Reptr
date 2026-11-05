import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, testDatabaseUrl } from "@/db/test/test-db";
import { dayLog } from "@/modules/nutrition/nutrition";
import { getCheckin } from "@/modules/recovery/recovery";
import { applyOp, opSchema } from "./outbox";

describe("offline op schema", () => {
  it("rejects unknown kinds and bad values", () => {
    expect(opSchema.safeParse({ id: randomUUID(), kind: "delete_all", payload: {} }).success).toBe(
      false,
    );
    expect(
      opSchema.safeParse({
        id: randomUUID(),
        kind: "water",
        payload: { day: "2026-11-01", ml: 99999 },
      }).success,
    ).toBe(false);
  });
});

describe.skipIf(!testDatabaseUrl)("replaying queued changes", () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  const alice = randomUUID();
  const bob = randomUUID();
  beforeAll(async () => {
    t = await createTestDatabase("outbox");
    await t.addUser(alice);
    await t.addUser(bob);
  });
  afterAll(() => t?.close());

  it("applies each op once, however many times it's sent", async () => {
    const op = opSchema.parse({
      id: randomUUID(),
      kind: "food",
      payload: { day: "2026-11-01", meal: "lunch", name: "Rice", calories: 300 },
    });
    expect(await applyOp(t.db, alice, op)).toEqual({ duplicate: false });
    expect(await applyOp(t.db, alice, op)).toEqual({ duplicate: true });
    await Promise.all([applyOp(t.db, alice, op), applyOp(t.db, alice, op)]);
    expect((await dayLog(t.db, alice, "2026-11-01")).foods).toHaveLength(1);

    const water = opSchema.parse({
      id: randomUUID(),
      kind: "water",
      payload: { day: "2026-11-01", ml: 500 },
    });
    await applyOp(t.db, alice, water);
    await applyOp(t.db, alice, water);
    expect((await dayLog(t.db, alice, "2026-11-01")).waterMl).toBe(500);
  });

  it("keeps op ids per user", async () => {
    const id = randomUUID();
    const checkin = (sleepHours: number) =>
      opSchema.parse({ id, kind: "checkin", payload: { day: "2026-11-02", sleepHours } });
    await applyOp(t.db, alice, checkin(7));
    expect(await applyOp(t.db, bob, checkin(6))).toEqual({ duplicate: false });
    expect(await getCheckin(t.db, bob, "2026-11-02")).toMatchObject({ sleepHours: 6 });
  });

  it("rolls the op id back when the change itself fails", async () => {
    const op = opSchema.parse({
      id: randomUUID(),
      kind: "body",
      payload: { day: "2026-11-02", values: { weight: 80 } },
    });
    const ghost = randomUUID(); // a user that doesn't exist, so the insert fails
    await expect(applyOp(t.db, ghost, op)).rejects.toThrow();
    expect(await applyOp(t.db, alice, op)).toEqual({ duplicate: false });
  });
});
