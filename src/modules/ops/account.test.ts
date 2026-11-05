import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, testDatabaseUrl } from "@/db/test/test-db";
import { entrySchema, logEntry } from "@/modules/body/body";
import { addMemory } from "@/modules/coach/memory";
import { saveFood } from "@/modules/nutrition/foods";
import { addFood, foodSchema } from "@/modules/nutrition/nutrition";
import { checkinSchema, saveCheckin } from "@/modules/recovery/recovery";
import { deleteAccount } from "./account";
import { audit, recentAudit } from "./audit";

describe.skipIf(!testDatabaseUrl)("account deletion and audit log", () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  const alice = randomUUID();
  const bob = randomUUID();

  beforeAll(async () => {
    t = await createTestDatabase("account");
    await t.addUser(alice);
    await t.addUser(bob);
  });
  afterAll(() => t?.close());

  const fill = async (u: string) => {
    await addFood(
      t.db,
      u,
      foodSchema.parse({ day: "2026-11-01", meal: "lunch", name: "Rice", calories: 300 }),
    );
    await saveFood(t.db, u, {
      name: "Oats",
      servingLabel: "1 bowl",
      calories: 150,
      proteinG: 5,
      carbsG: 27,
      fatG: 3,
    });
    await saveCheckin(t.db, u, checkinSchema.parse({ day: "2026-11-01", sleepHours: 7 }));
    await logEntry(t.db, u, entrySchema.parse({ day: "2026-11-01", values: { weight: 80 } }));
    await addMemory(t.db, u, { kind: "injury", content: "Left shoulder" });
    await audit(t.db, u, "data_exported", { format: "json" });
  };

  it("records actions newest first, with readable labels", async () => {
    await audit(t.db, bob, "signed_in");
    await audit(t.db, bob, "data_exported", { format: "csv" });
    const rows = await recentAudit(t.db, bob);
    expect(rows.map((r) => r.label)).toEqual(["Downloaded your data", "Signed in"]);
    expect(rows[0].detail).toEqual({ format: "csv" });
  });

  it("removes every row the user owns, and nobody else's", async () => {
    await fill(alice);
    await fill(bob);
    // Every table with an owner column, so a table added later can't be missed.
    const tables = await t.sql<{ table_name: string; column_name: string }[]>`
      select table_name, column_name from information_schema.columns
      where table_schema = 'public' and column_name in ('user_id', 'owner_id')`;
    const count = async (u: string) => {
      let n = 0;
      for (const c of tables) {
        const [r] = await t.sql.unsafe(
          `select count(*)::int as n from "${c.table_name}" where "${c.column_name}" = $1`,
          [u],
        );
        n += r.n;
      }
      return n;
    };
    expect(await count(alice)).toBeGreaterThan(5);
    const bobBefore = await count(bob);

    expect(await deleteAccount(t.db, alice)).toBe(true);
    expect(await count(alice)).toBe(0);
    expect(await count(bob)).toBe(bobBefore);
    expect(await deleteAccount(t.db, alice)).toBe(false);
  });
});
