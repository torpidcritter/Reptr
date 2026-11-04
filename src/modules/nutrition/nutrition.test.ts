import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, testDatabaseUrl } from "@/db/test/test-db";
import {
  addFood,
  addWater,
  dailyTotals,
  dayLog,
  deleteFood,
  foodSchema,
  getTargets,
  recentFoods,
  saveTargets,
} from "./nutrition";
import { kcalFromMacros, suggestTargets } from "./targets";

describe("suggestTargets", () => {
  it("scales with weight and goal", () => {
    expect(suggestTargets(80, "all_round")).toEqual({
      calories: 2500,
      proteinG: 130,
      carbsG: 340,
      fatG: 70,
      waterMl: 2750,
    });
    const cut = suggestTargets(80, "recomposition");
    expect(cut.calories).toBeLessThan(2500);
    expect(cut.proteinG).toBe(175);
    expect(kcalFromMacros(cut.proteinG, cut.carbsG, cut.fatG)).toBeCloseTo(cut.calories, -2);
  });
});

describe.skipIf(!testDatabaseUrl)("nutrition log", () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  const alice = randomUUID();
  const bob = randomUUID();
  const food = (p: Partial<Parameters<typeof foodSchema.parse>[0]> = {}) =>
    foodSchema.parse({
      day: "2026-11-04",
      meal: "breakfast",
      name: "Oats",
      calories: 350,
      proteinG: 12,
      carbsG: 60,
      fatG: 7,
      ...p,
    });

  beforeAll(async () => {
    t = await createTestDatabase("nutrition");
    await t.addUser(alice);
    await t.addUser(bob);
  });
  afterAll(() => t?.close());

  it("totals a day and keeps users apart", async () => {
    await addFood(t.db, alice, food());
    await addFood(
      t.db,
      alice,
      food({
        name: "Chicken rice",
        meal: "lunch",
        calories: 650,
        proteinG: 45,
        carbsG: 80,
        fatG: 12,
      }),
    );
    await addFood(t.db, alice, food({ day: "2026-11-03", name: "oats" }));
    await addFood(t.db, bob, food());

    const log = await dayLog(t.db, alice, "2026-11-04");
    expect(log.foods).toHaveLength(2);
    expect(log.totals).toEqual({ calories: 1000, proteinG: 57, carbsG: 140, fatG: 19 });

    await deleteFood(t.db, bob, log.foods[0].id);
    expect((await dayLog(t.db, alice, "2026-11-04")).foods).toHaveLength(2);

    const recent = await recentFoods(t.db, alice);
    expect(recent.map((r) => r.name).sort()).toEqual(["Chicken rice", "oats"]);

    const totals = await dailyTotals(t.db, alice, "2026-11-01", "2026-11-04");
    expect(totals.map((d) => [d.day, d.calories])).toEqual([
      ["2026-11-03", 350],
      ["2026-11-04", 1000],
    ]);
  });

  it("adds and undoes water without going negative", async () => {
    expect(await addWater(t.db, alice, "2026-11-04", 500)).toBe(500);
    expect(await addWater(t.db, alice, "2026-11-04", 250)).toBe(750);
    expect(await addWater(t.db, alice, "2026-11-04", -1000)).toBe(0);
    expect((await dayLog(t.db, alice, "2026-11-04")).waterMl).toBe(0);
  });

  it("saves targets", async () => {
    expect(await getTargets(t.db, alice)).toBeNull();
    await saveTargets(t.db, alice, {
      calories: 2400,
      proteinG: 160,
      carbsG: null,
      fatG: null,
      waterMl: 3000,
    });
    await saveTargets(t.db, alice, {
      calories: 2300,
      proteinG: 160,
      carbsG: null,
      fatG: null,
      waterMl: 3000,
    });
    expect(await getTargets(t.db, alice)).toMatchObject({ calories: 2300, proteinG: 160 });
  });
});
