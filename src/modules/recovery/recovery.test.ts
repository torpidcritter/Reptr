import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, testDatabaseUrl } from "@/db/test/test-db";
import { loadRatio, readiness } from "./readiness";
import { checkinRange, checkinSchema, getCheckin, saveCheckin } from "./recovery";

describe("readiness", () => {
  it("is high after good sleep and normal load", () => {
    const r = readiness(
      { sleepHours: 8, sleepQuality: 5, energy: 4, soreness: 2, stress: 2 },
      loadRatio(10000, 40000),
    )!;
    expect(r.score).toBeGreaterThanOrEqual(80);
    expect(r.level).toBe("high");
    expect(r.factors).toContainEqual({ label: "Sleep length", effect: "helps" });
  });

  it("is low after a bad night and a big jump in training", () => {
    const r = readiness(
      { sleepHours: 5, sleepQuality: 1, energy: 2, soreness: 5, stress: 4 },
      loadRatio(20000, 40000),
    )!;
    expect(r.level).toBe("low");
    expect(r.factors.map((f) => f.label)).toContain("Training load");
  });

  it("works from partial input and needs at least one", () => {
    expect(
      readiness(
        { sleepHours: 7, sleepQuality: null, energy: null, soreness: null, stress: null },
        null,
      ),
    ).toMatchObject({ inputs: 1 });
    expect(readiness(null, null)).toBeNull();
    expect(loadRatio(5000, 0)).toBeNull();
  });
});

describe.skipIf(!testDatabaseUrl)("check-ins", () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  const alice = randomUUID();
  const bob = randomUUID();

  beforeAll(async () => {
    t = await createTestDatabase("recovery");
    await t.addUser(alice);
    await t.addUser(bob);
  });
  afterAll(() => t?.close());

  it("keeps one check-in per day and per user", async () => {
    await saveCheckin(
      t.db,
      alice,
      checkinSchema.parse({ day: "2026-11-04", sleepHours: 7.5, energy: 4 }),
    );
    await saveCheckin(
      t.db,
      alice,
      checkinSchema.parse({ day: "2026-11-04", sleepHours: 8, steps: 9000 }),
    );
    await saveCheckin(t.db, alice, checkinSchema.parse({ day: "2026-11-03", steps: 4000 }));
    expect(await getCheckin(t.db, alice, "2026-11-04")).toMatchObject({
      sleepHours: 8,
      steps: 9000,
      energy: null,
    });
    expect(await getCheckin(t.db, bob, "2026-11-04")).toBeNull();
    expect((await checkinRange(t.db, alice, "2026-11-01", "2026-11-04")).map((c) => c.day)).toEqual(
      ["2026-11-03", "2026-11-04"],
    );
  });
});
