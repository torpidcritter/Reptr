import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, testDatabaseUrl } from "@/db/test/test-db";
import {
  deleteSavedFood,
  DuplicateFoodError,
  getSavedFood,
  listSavedFoods,
  perServing,
  portion,
  recipeSchema,
  saveFood,
  saveRecipe,
} from "./foods";

const chili = {
  name: "Chili",
  servings: 4,
  ingredients: [
    { name: "Beef mince 500 g", calories: 1250, proteinG: 100, carbsG: 0, fatG: 90 },
    { name: "Beans", calories: 450, proteinG: 30, carbsG: 70, fatG: 2 },
    { name: "Tomatoes", calories: 100, proteinG: 4, carbsG: 20, fatG: 1 },
  ],
};

describe("recipes and portions", () => {
  it("divides a batch into servings and scales portions", () => {
    expect(perServing(chili.ingredients, 4)).toEqual({
      calories: 450,
      proteinG: 33.5,
      carbsG: 22.5,
      fatG: 23.3,
    });
    expect(portion({ name: "Oats", calories: 150, proteinG: 5, carbsG: 27, fatG: 3 }, 1.5)).toEqual(
      {
        name: "Oats × 1.5",
        calories: 225,
        proteinG: 7.5,
        carbsG: 40.5,
        fatG: 4.5,
      },
    );
    expect(portion({ name: "Oats", calories: 150, proteinG: 5, carbsG: 27, fatG: 3 }, 1).name).toBe(
      "Oats",
    );
    expect(recipeSchema.safeParse({ ...chili, servings: 0 }).success).toBe(false);
  });
});

describe.skipIf(!testDatabaseUrl)("saved foods", () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  const alice = randomUUID();
  const bob = randomUUID();
  beforeAll(async () => {
    t = await createTestDatabase("foods");
    await t.addUser(alice);
    await t.addUser(bob);
  });
  afterAll(() => t?.close());

  it("saves foods and recipes per user, refusing duplicate names", async () => {
    await saveFood(t.db, alice, {
      name: "Greek yogurt",
      servingLabel: "200 g pot",
      calories: 190,
      proteinG: 20,
      carbsG: 8,
      fatG: 8,
    });
    const { id } = await saveRecipe(t.db, alice, recipeSchema.parse(chili));
    await expect(
      saveFood(t.db, alice, {
        name: "greek YOGURT",
        servingLabel: "x",
        calories: 1,
        proteinG: 0,
        carbsG: 0,
        fatG: 0,
      }),
    ).rejects.toBeInstanceOf(DuplicateFoodError);
    await saveFood(t.db, bob, {
      name: "Greek yogurt",
      servingLabel: "pot",
      calories: 100,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
    });

    const list = await listSavedFoods(t.db, alice);
    expect(list.map((f) => [f.kind, f.name])).toEqual([
      ["recipe", "Chili"],
      ["food", "Greek yogurt"],
    ]);
    expect(list[0]).toMatchObject({ calories: 450, servings: 4 });
    expect(await getSavedFood(t.db, bob, id)).toBeNull();
    expect((await getSavedFood(t.db, alice, id))?.ingredients).toHaveLength(3);
    await deleteSavedFood(t.db, bob, id);
    expect(await listSavedFoods(t.db, alice)).toHaveLength(2);
    await deleteSavedFood(t.db, alice, id);
    expect(await listSavedFoods(t.db, alice)).toHaveLength(1);
  });
});
