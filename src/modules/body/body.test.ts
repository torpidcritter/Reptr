import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, testDatabaseUrl } from "@/db/test/test-db";
import {
  addPhoto,
  deleteMetric,
  deletePhoto,
  entrySchema,
  listPhotos,
  logEntry,
  measurementSummary,
  metricSeries,
} from "./body";

describe("entrySchema", () => {
  it("needs at least one value and a sane body fat", () => {
    expect(entrySchema.safeParse({ day: "2026-11-04", values: {} }).success).toBe(false);
    expect(entrySchema.safeParse({ day: "2026-11-04", values: { body_fat: 90 } }).success).toBe(
      false,
    );
    expect(
      entrySchema.parse({ day: "2026-11-04", values: { weight: 80.4, waist: 84 } }).bodyFatMethod,
    ).toBeNull();
  });
});

describe.skipIf(!testDatabaseUrl)("body metrics", () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  const alice = randomUUID();
  const bob = randomUUID();

  beforeAll(async () => {
    t = await createTestDatabase("body");
    await t.addUser(alice);
    await t.addUser(bob);
  });
  afterAll(() => t?.close());

  it("logs check-ins and summarises first vs latest", async () => {
    await logEntry(
      t.db,
      alice,
      entrySchema.parse({ day: "2026-10-01", values: { weight: 82, waist: 88 } }),
    );
    await logEntry(t.db, alice, entrySchema.parse({ day: "2026-11-01", values: { weight: 80.5 } }));
    await logEntry(t.db, bob, entrySchema.parse({ day: "2026-11-01", values: { weight: 60 } }));

    const series = await metricSeries(t.db, alice, "weight");
    expect(series.map((s) => [s.day, s.value])).toEqual([
      ["2026-10-01", 82],
      ["2026-11-01", 80.5],
    ]);
    const sum = await measurementSummary(t.db, alice);
    expect(sum.get("weight")).toMatchObject({ first: 82, latest: 80.5, count: 2 });
    expect(sum.get("waist")).toMatchObject({ first: 88, latest: 88, count: 1 });

    await deleteMetric(t.db, bob, series[0].id); // not bob's: nothing happens
    expect(await metricSeries(t.db, alice, "weight")).toHaveLength(2);
    await deleteMetric(t.db, alice, series[0].id);
    expect(await metricSeries(t.db, alice, "weight")).toHaveLength(1);
  });

  it("keeps photos in the owner's folder", async () => {
    const path = `${alice}/${randomUUID()}.jpg`;
    await expect(
      addPhoto(t.db, bob, { pose: "front", takenOn: "2026-11-01", storagePath: path }),
    ).rejects.toThrow();
    const { id } = await addPhoto(t.db, alice, {
      pose: "front",
      takenOn: "2026-11-01",
      storagePath: path,
    });
    expect(await listPhotos(t.db, bob)).toEqual([]);
    expect(await deletePhoto(t.db, bob, id)).toBeNull();
    expect(await deletePhoto(t.db, alice, id)).toEqual({ storagePath: path });
  });
});
