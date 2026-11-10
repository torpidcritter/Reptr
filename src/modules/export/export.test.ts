import { randomUUID } from "node:crypto";
import { getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { createTestDatabase, testDatabaseUrl } from "@/db/test/test-db";
import {
  exportAll,
  exportedTableNames,
  hasUserColumn,
  notExported,
  safeCell,
  toCsv,
} from "./export";

describe("toCsv", () => {
  it("quotes only what needs quoting", () => {
    expect(
      toCsv([
        { a: "plain", b: 1, c: null },
        { a: 'say "hi", ok', b: 2.5, c: new Date("2026-11-04T00:00:00Z") },
      ]),
    ).toBe('a,b,c\r\nplain,1,\r\n"say ""hi"", ok",2.5,2026-11-04T00:00:00.000Z\r\n');
    expect(toCsv([])).toBe("");
  });

  it("neutralizes cells a spreadsheet would run as formulas", () => {
    expect(safeCell('=HYPERLINK("http://x")')).toBe('\'=HYPERLINK("http://x")');
    expect(safeCell("+1")).toBe("'+1");
    expect(safeCell("-2")).toBe("'-2");
    expect(safeCell("@cmd")).toBe("'@cmd");
    expect(safeCell(-250)).toBe("-250");
    expect(safeCell("Bench press")).toBe("Bench press");
  });
});

describe("export coverage", () => {
  it("includes every table that holds a person's data, or says why not", () => {
    const tables = (Object.values(schema) as unknown[]).filter((t): t is PgTable => is(t, PgTable));
    const personal = tables.filter(hasUserColumn).map((t) => getTableName(t));
    const covered = new Set([...exportedTableNames(), ...Object.keys(notExported)]);
    expect(personal.filter((n) => !covered.has(n))).toEqual([]);
  });
});

describe.skipIf(!testDatabaseUrl)("export contents", () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  const me = randomUUID();
  const other = randomUUID();
  beforeAll(async () => {
    t = await createTestDatabase("export");
    await t.addUser(me);
    await t.addUser(other);
    await t.sql`insert into food_entries (user_id, day, name, calories) values (${me}, '2026-11-01', 'Oats', 300), (${other}, '2026-11-01', 'Not mine', 1)`;
    await t.sql`insert into water_entries (user_id, day, ml) values (${me}, '2026-11-01', 500)`;
    await t.sql`insert into coach_memories (user_id, kind, content) values (${me}, 'injury', 'Left knee')`;
  });
  afterAll(() => t?.close());

  it("exports the person's own rows from every section and nobody else's", async () => {
    const out = await exportAll(t.db, me);
    expect(out.format).toBe("reptr-export-v2");
    expect((out.foodEntries as { name: string }[]).map((f) => f.name)).toEqual(["Oats"]);
    expect(out.waterEntries).toHaveLength(1);
    expect(out.coachMemories).toHaveLength(1);
    for (const key of ["recoveryCheckins", "programs", "goals", "savedFoods", "accountActivity"]) {
      expect(Array.isArray(out[key])).toBe(true);
    }
  });
});
