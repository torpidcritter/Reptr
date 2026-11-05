import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, testDatabaseUrl } from "@/db/test/test-db";
import { addMemory, deleteMemory, listMemories, memoryPrompt, memorySchema } from "./memory";

describe("memory prompt", () => {
  it("lists notes for the system prompt, or nothing", () => {
    expect(memoryPrompt([])).toBe("");
    expect(
      memoryPrompt([{ kind: "injury", content: "Left shoulder: no overhead pressing" }]),
    ).toMatch(/- \[injury\] Left shoulder/);
    expect(memorySchema.safeParse({ kind: "mood", content: "x" }).success).toBe(false);
  });
});

describe.skipIf(!testDatabaseUrl)("coach memory", () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  const alice = randomUUID();
  const bob = randomUUID();
  beforeAll(async () => {
    t = await createTestDatabase("memory");
    await t.addUser(alice);
    await t.addUser(bob);
  });
  afterAll(() => t?.close());

  it("saves, dedupes and deletes only the owner's notes", async () => {
    const note = { kind: "equipment" as const, content: "Home gym: dumbbells to 30 kg" };
    expect(await addMemory(t.db, alice, note)).toBe(true);
    expect(await addMemory(t.db, alice, { ...note, content: note.content.toUpperCase() })).toBe(
      false,
    );
    const [m] = await listMemories(t.db, alice);
    expect(m).toMatchObject(note);
    expect(await listMemories(t.db, bob)).toEqual([]);
    await deleteMemory(t.db, bob, m.id);
    expect(await listMemories(t.db, alice)).toHaveLength(1);
    await deleteMemory(t.db, alice, m.id);
    expect(await listMemories(t.db, alice)).toEqual([]);
  });
});

describe("propose_memory tool", () => {
  it("returns a proposal instead of saving", async () => {
    const { runTool } = await import("./tools");
    const ctx = { db: null as never, userId: "u", timeZone: "UTC", now: new Date() };
    const out = await runTool(
      ctx,
      "propose_memory",
      JSON.stringify({ kind: "equipment", content: " Only dumbbells " }),
    );
    expect(out.proposal).toEqual({
      kind: "remember",
      summary: "Remember: Only dumbbells",
      payload: { kind: "equipment", content: "Only dumbbells" },
    });
    expect(out.result).toMatchObject({ status: "proposed" });
  });
});
