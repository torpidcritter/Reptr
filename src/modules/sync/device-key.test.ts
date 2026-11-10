import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, testDatabaseUrl } from "@/db/test/test-db";
import { withUser } from "@/db/with-user";
import { deviceKey } from "./device-key";

describe.skipIf(!testDatabaseUrl)("device keys", () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  const a = randomUUID();
  const b = randomUUID();

  beforeAll(async () => {
    t = await createTestDatabase("device_keys");
    for (const u of [a, b]) await t.addUser(u);
  });
  afterAll(() => t?.close());

  it("gives each account one stable 32-byte key that signed-in clients can't read", async () => {
    const first = await deviceKey(t.db, a);
    expect(Buffer.from(first, "base64")).toHaveLength(32);
    expect(await deviceKey(t.db, a)).toBe(first);
    expect(await deviceKey(t.db, b)).not.toBe(first);
    await expect(
      withUser(t.db, a, (tx) => tx.execute("select key from public.device_keys")),
    ).rejects.toThrow();
  });
});
