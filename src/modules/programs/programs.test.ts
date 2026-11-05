import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, testDatabaseUrl } from "@/db/test/test-db";
import { activeProgram, endProgram, programSchema, startProgram } from "./programs";

describe("program form", () => {
  it("accepts no deload and rejects silly lengths", () => {
    expect(
      programSchema.parse({ name: "Block", startDate: "2026-11-04", weeks: "6", deloadEvery: "" }),
    ).toEqual({ name: "Block", startDate: "2026-11-04", weeks: 6, deloadEvery: null });
    expect(
      programSchema.safeParse({ name: "B", startDate: "2026-11-04", weeks: "1" }).success,
    ).toBe(false);
  });
});

describe.skipIf(!testDatabaseUrl)("programs", () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  const alice = randomUUID();
  const bob = randomUUID();
  beforeAll(async () => {
    t = await createTestDatabase("programs");
    await t.addUser(alice);
    await t.addUser(bob);
  });
  afterAll(() => t?.close());

  it("keeps one active block, starting on a Monday", async () => {
    const input = { name: "Strength", startDate: "2026-11-05", weeks: 8, deloadEvery: 4 };
    await startProgram(t.db, alice, input);
    await startProgram(t.db, alice, { ...input, name: "Hypertrophy" });
    expect(await activeProgram(t.db, alice)).toMatchObject({
      name: "Hypertrophy",
      startDate: "2026-11-02",
    });
    expect(await activeProgram(t.db, bob)).toBeNull();
    await endProgram(t.db, bob);
    expect(await activeProgram(t.db, alice)).not.toBeNull();
    await endProgram(t.db, alice);
    expect(await activeProgram(t.db, alice)).toBeNull();
  });
});
