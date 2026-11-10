// Runs against a real Supabase staging project: real sign-in tokens, real storage
// policies, real deletes. It never runs against production, and is skipped (loudly)
// unless all the STAGING_* variables are set. See docs/ops/STAGING_TESTS.md.

import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { emptyFolder, listFolder, removeFiles } from "@/lib/supabase/storage";
import { photoBucket } from "@/modules/body/metrics";

const env = {
  url: process.env.STAGING_SUPABASE_URL,
  anon: process.env.STAGING_SUPABASE_ANON_KEY,
  service: process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY,
  db: process.env.STAGING_DATABASE_URL,
};
const configured = Boolean(env.url && env.anon && env.service && env.db);
if (!configured) {
  console.warn(
    "[staging] Supabase staging tests SKIPPED: set STAGING_SUPABASE_URL, STAGING_SUPABASE_ANON_KEY, STAGING_SUPABASE_SERVICE_ROLE_KEY and STAGING_DATABASE_URL to run them.",
  );
}
if (configured && /prod/i.test(env.url!))
  throw new Error("Refusing to run staging tests on a production URL");

type Person = { id: string; email: string; client: SupabaseClient };

describe.skipIf(!configured)("Supabase staging: auth, storage and deletion", () => {
  let admin: SupabaseClient;
  let sql: postgres.Sql;
  let a: Person;
  let b: Person;
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

  /** Creates a user and signs them in through the same token-hash flow the email link uses. */
  async function person(): Promise<Person> {
    const email = `reptr-staging-${randomUUID()}@example.com`;
    const created = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (created.error) throw created.error;
    const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (link.error) throw link.error;
    const client = createClient(env.url!, env.anon!, { auth: { persistSession: false } });
    const verified = await client.auth.verifyOtp({
      type: "magiclink",
      token_hash: link.data.properties.hashed_token,
    });
    if (verified.error) throw verified.error;
    return { id: created.data.user.id, email, client };
  }

  beforeAll(async () => {
    admin = createClient(env.url!, env.service!, { auth: { persistSession: false } });
    sql = postgres(env.db!, { prepare: false, max: 1 });
    a = await person();
    b = await person();
  });

  afterAll(async () => {
    for (const p of [a, b]) if (p) await admin.auth.admin.deleteUser(p.id).catch(() => {});
    await sql?.end();
  });

  it("signs in with a one-time link token and can't reuse it", async () => {
    const { data } = await a.client.auth.getUser();
    expect(data.user?.id).toBe(a.id);
    const link = await admin.auth.admin.generateLink({ type: "magiclink", email: a.email });
    const token = link.data.properties!.hashed_token;
    const c = createClient(env.url!, env.anon!, { auth: { persistSession: false } });
    expect((await c.auth.verifyOtp({ type: "magiclink", token_hash: token })).error).toBeNull();
    expect((await c.auth.verifyOtp({ type: "magiclink", token_hash: token })).error).not.toBeNull();
  });

  it("refreshes a session", async () => {
    const { data, error } = await a.client.auth.refreshSession();
    expect(error).toBeNull();
    expect(data.session?.user.id).toBe(a.id);
  });

  it("lets a user upload, link and delete photos only in their own folder", async () => {
    const own = `${a.id}/${randomUUID()}.jpg`;
    const up = await a.client.storage
      .from(photoBucket)
      .upload(own, jpeg, { contentType: "image/jpeg" });
    expect(up.error).toBeNull();

    const theirs = `${b.id}/${randomUUID()}.jpg`;
    const denied = await a.client.storage
      .from(photoBucket)
      .upload(theirs, jpeg, { contentType: "image/jpeg" });
    expect(denied.error).not.toBeNull();

    const link = await a.client.storage.from(photoBucket).createSignedUrl(own, 60);
    expect(link.error).toBeNull();
    expect((await fetch(link.data!.signedUrl)).status).toBe(200);
    const other = await b.client.storage.from(photoBucket).createSignedUrl(own, 60);
    expect(other.data?.signedUrl).toBeUndefined();

    // B can't see or delete A's file; the delete reports no error but removes nothing,
    // which is exactly why removeFiles checks the folder afterwards.
    expect(await listFolder(photoBucket, a.id, b.client)).toEqual([]);
    await b.client.storage.from(photoBucket).remove([own]);
    expect((await listFolder(photoBucket, a.id, a.client)).map((f) => f.path)).toContain(own);

    await removeFiles(photoBucket, [own], a.client);
    expect(await listFolder(photoBucket, a.id, a.client)).toEqual([]);
  });

  it("empties a user's whole folder before the account is deleted", async () => {
    for (let i = 0; i < 3; i++) {
      await a.client.storage
        .from(photoBucket)
        .upload(`${a.id}/${randomUUID()}.jpg`, jpeg, { contentType: "image/jpeg" });
    }
    expect(await emptyFolder(photoBucket, a.id, a.client)).toBe(3);
    expect(await listFolder(photoBucket, a.id, a.client)).toEqual([]);
    await sql`delete from auth.users where id = ${a.id}`;
    const left = await admin.storage.from(photoBucket).list(a.id);
    expect(left.data ?? []).toEqual([]);
  });

  it("keeps each user's rows to themselves through the Data API, if it's exposed", async () => {
    await sql`insert into profiles (user_id, display_name) values (${b.id}, 'B') on conflict do nothing`;
    const res = await a.client.from("profiles").select("user_id").eq("user_id", b.id);
    // Either the Data API is off for this schema (an error), or RLS hides B's row.
    if (!res.error) expect(res.data).toEqual([]);
  });
});
