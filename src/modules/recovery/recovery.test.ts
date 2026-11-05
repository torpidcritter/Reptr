import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, testDatabaseUrl } from "@/db/test/test-db";
import { baselineFrom, loadRatio, readiness } from "./readiness";
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

describe("readiness against your own baseline", () => {
  const plain = {
    sleepHours: null,
    sleepQuality: null,
    energy: null,
    soreness: null,
    stress: null,
  };
  it("reads HRV and resting HR relative to usual", () => {
    const base = baselineFrom(Array.from({ length: 6 }, () => ({ restingHr: 55, hrvMs: 60 })));
    expect(base).toEqual({ restingHr: 55, hrvMs: 60 });
    const good = readiness({ ...plain, hrvMs: 72, restingHr: 52 }, null, base)!;
    expect(good.score).toBeGreaterThanOrEqual(90);
    const poor = readiness({ ...plain, hrvMs: 45, restingHr: 62 }, null, base)!;
    expect(poor.level).toBe("low");
    expect(poor.factors.map((f) => f.label)).toEqual(["HRV", "Resting heart rate"]);
    // Without a baseline they're left out.
    expect(readiness({ ...plain, hrvMs: 45 }, null, baselineFrom([]))).toBeNull();
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

  it("stores HRV and sore muscles, and rejects unknown muscles", async () => {
    await saveCheckin(
      t.db,
      bob,
      checkinSchema.parse({
        day: "2026-11-02",
        hrvMs: 64,
        soreMuscles: ["quads", "quads", "calves"],
      }),
    );
    expect(await getCheckin(t.db, bob, "2026-11-02")).toMatchObject({
      hrvMs: 64,
      soreMuscles: ["quads", "calves"],
    });
    expect(checkinSchema.safeParse({ day: "2026-11-02", soreMuscles: ["toes"] }).success).toBe(
      false,
    );
    expect(checkinSchema.safeParse({ day: "2026-11-02", hrvMs: 2 }).success).toBe(false);
  });

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
