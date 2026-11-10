import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, testDatabaseUrl } from "@/db/test/test-db";
import {
  budgetBlock,
  capToolResult,
  coachLimits,
  costMicros,
  recordUsage,
  trimHistory,
} from "./budget";

const limits = { ...coachLimits(), historyChars: 100, messageChars: 60, historyTurns: 4 };

describe("coach limits", () => {
  it("sends only the newest turns that fit, starting with the person", () => {
    const history = Array.from({ length: 10 }, (_, i) => ({
      role: (i % 2 ? "assistant" : "user") as "user" | "assistant",
      content: `message ${i} `.padEnd(30, "x"),
    }));
    const out = trimHistory(history, limits);
    expect(out.at(-1)!.content).toContain("message 9");
    expect(out[0].role).toBe("user");
    expect(out.reduce((n, t) => n + t.content.length, 0)).toBeLessThanOrEqual(100);
  });

  it("always keeps the question, shortened if it's huge", () => {
    const out = trimHistory([{ role: "user", content: "y".repeat(500) }], limits);
    expect(out).toHaveLength(1);
    expect(out[0].content).toMatch(/shortened\]$/);
    expect(out[0].content.length).toBeLessThan(80);
  });

  it("caps tool results", () => {
    expect(capToolResult('{"a":1}', 100)).toBe('{"a":1}');
    expect(JSON.parse(capToolResult("x".repeat(500), 100))).toMatchObject({ truncated: true });
  });

  it("prices tokens per million", () => {
    expect(costMicros(1_000_000, 0, { input: 0.4, output: 1.6 })).toBe(400_000);
    expect(costMicros(1000, 1000, { input: 0.4, output: 1.6 })).toBe(2000);
  });
});

describe.skipIf(!testDatabaseUrl)("coach budgets", () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  const a = randomUUID();
  const b = randomUUID();
  beforeAll(async () => {
    t = await createTestDatabase("coach_budget");
    await t.addUser(a);
    await t.addUser(b);
  });
  afterAll(() => t?.close());

  it("stops one person at their daily tokens, without stopping others", async () => {
    const tight = { ...coachLimits(), userDailyTokens: 1000, globalDailyUsd: 100 };
    expect(await budgetBlock(t.db, a, tight)).toBeNull();
    await recordUsage(t.db, a, "test", { promptTokens: 900, completionTokens: 200 }, "answered");
    expect(await budgetBlock(t.db, a, tight)).toMatch(/allowance/);
    expect(await budgetBlock(t.db, b, tight)).toBeNull();
  });

  it("stops everyone at the overall daily spend", async () => {
    const tight = { ...coachLimits(), userDailyTokens: 1e9, globalDailyUsd: 0.000001 };
    expect(await budgetBlock(t.db, b, tight)).toMatch(/overall limit/);
  });
});
