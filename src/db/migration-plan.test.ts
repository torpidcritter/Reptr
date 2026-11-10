import { describe, expect, it } from "vitest";
import { entriesUpTo, fileHash, planMigrations, readJournal } from "./migration-plan";

const entries = [
  { idx: 0, when: 100, tag: "0000_init" },
  { idx: 1, when: 200, tag: "0001_more" },
  { idx: 2, when: 300, tag: "0002_last" },
];
const hashOf = (tag: string) => `h-${tag}`;

describe("migration plan", () => {
  it("marks applied, pending and edited migrations", () => {
    const states = planMigrations(
      entries,
      [
        { hash: "h-0000_init", created_at: "100" },
        { hash: "different", created_at: 200 },
      ],
      hashOf,
    );
    expect(states.map((s) => s.status)).toEqual(["applied", "changed", "pending"]);
  });

  it("stops at a chosen migration, by full tag or number", () => {
    const states = planMigrations(entries, [{ hash: "h-0000_init", created_at: 100 }], hashOf);
    expect(entriesUpTo(entries, states, "0001_more").map((e) => e.tag)).toEqual([
      "0000_init",
      "0001_more",
    ]);
    expect(entriesUpTo(entries, states, "0001")).toHaveLength(2);
    expect(() => entriesUpTo(entries, states, "0009")).toThrow(/No migration/);
  });

  it("refuses to go backwards", () => {
    const states = planMigrations(
      entries,
      entries.map((e) => ({ hash: hashOf(e.tag), created_at: e.when })),
      hashOf,
    );
    expect(() => entriesUpTo(entries, states, "0001")).toThrow(/already applied/);
  });

  it("reads the real journal, which has unique, increasing timestamps", () => {
    const real = readJournal();
    expect(real.length).toBeGreaterThan(30);
    real.slice(1).forEach((e, i) => expect(e.when).toBeGreaterThan(real[i].when));
    expect(fileHash("src/db/migrations", real[0].tag)).toMatch(/^[0-9a-f]{64}$/);
  });
});
