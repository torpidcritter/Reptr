import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, testDatabaseUrl } from "@/db/test/test-db";
import { withUser } from "@/db/with-user";
import { deleteAccount } from "@/modules/ops/account";
import { leaveSocial, myProfile, saveProfile } from "@/modules/social/social";
import {
  createIdentity,
  forgetDevice,
  identitySchema,
  normalizeKey,
  ProfileError,
  replaceProfileKey,
  restoreWithKey,
  setAvatarPath,
  updateIdentity,
  userForToken,
  usernameSchema,
} from "./identity";

describe("username rules", () => {
  const error = (u: string) => usernameSchema.safeParse(u).error?.issues[0]?.message;

  it("trims spaces and keeps usernames lowercase", () => {
    expect(usernameSchema.parse("  Sam_Lifts99 ")).toBe("sam_lifts99");
  });

  it("explains what is wrong with a bad username", () => {
    expect(error("")).toBe("Choose a username.");
    expect(error("   ")).toBe("Choose a username.");
    expect(error("sam lifts")).toMatch(/letters, numbers and underscores/);
    expect(error("sam-lifts")).toMatch(/letters, numbers and underscores/);
    expect(error("sam!")).toMatch(/letters, numbers and underscores/);
    expect(error("ab")).toBe("Use at least 3 characters.");
    expect(error("a".repeat(21))).toBe("Use at most 20 characters.");
    expect(error("admin")).toMatch(/reserved/);
  });

  it("requires a name and checks the optional fields", () => {
    const base = { displayName: "Sam", username: "sam" };
    expect(identitySchema.parse({ ...base, contactEmail: "", bio: "  " })).toMatchObject({
      contactEmail: null,
      bio: null,
    });
    expect(identitySchema.safeParse({ ...base, displayName: "  " }).success).toBe(false);
    expect(identitySchema.safeParse({ ...base, contactEmail: "not an email" }).success).toBe(false);
    expect(identitySchema.safeParse({ ...base, bio: "x".repeat(161) }).success).toBe(false);
  });

  it("reads profile keys typed loosely", () => {
    const key = "ABCD-EFGH-JKMN-PQRS-TVWX-YZ01-2345-6789";
    expect(normalizeKey(key.toLowerCase().replace(/-/g, " "))).toBe(key);
    expect(normalizeKey("abcd efgh jkmn pqrs tvwx yzol 2345 6789")).toBe(key);
    expect(normalizeKey("too short")).toBeNull();
  });
});

describe.skipIf(!testDatabaseUrl)("profiles without sign-in", () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;

  beforeAll(async () => {
    t = await createTestDatabase("identity");
  });
  afterAll(() => t?.close());

  it("creates a profile with an account, and the cookie token finds it again", async () => {
    const made = await createIdentity(t.db, {
      displayName: " Sam Lee ",
      username: "Sam_Lee",
      contactEmail: "sam@example.com",
      bio: "Lifting since 2020",
    });
    expect(made.token.length).toBeGreaterThanOrEqual(43);
    expect(made.key).toMatch(/^([0-9A-Z]{4}-){7}[0-9A-Z]{4}$/);
    expect(await userForToken(t.db, made.token)).toBe(made.userId);
    expect(await userForToken(t.db, made.token + "x")).toBeNull();
    // The profile key is not a cookie token.
    expect(await userForToken(t.db, made.key)).toBeNull();

    const [row] = await t.sql`select display_name, username, contact_email, bio from profiles
      where user_id = ${made.userId}`;
    expect(row).toEqual({
      display_name: "Sam Lee",
      username: "sam_lee",
      contact_email: "sam@example.com",
      bio: "Lifting since 2020",
    });
    // Only hashes are stored.
    const tokens =
      await t.sql`select token_hash from identity_tokens where user_id = ${made.userId}`;
    expect(tokens.map((r) => r.token_hash)).not.toContain(made.token);
    expect(tokens.map((r) => r.token_hash)).not.toContain(made.key);
  });

  it("refuses a username someone already has, whatever the case", async () => {
    await createIdentity(t.db, { displayName: "Kim", username: "kim_lifts" });
    await expect(
      createIdentity(t.db, { displayName: "Other Kim", username: "KIM_LIFTS" }),
    ).rejects.toThrow(ProfileError);
    const [{ n }] =
      await t.sql`select count(*)::int as n from profiles where username = 'kim_lifts'`;
    expect(n).toBe(1);
    // The database refuses it too, if two people pick it at the same moment.
    await expect(
      t.db.execute(sql`update profiles set username = 'kim_lifts' where username = 'sam_lee'`),
    ).rejects.toThrow();
  });

  it("edits a profile and keeps the username unique", async () => {
    const a = await createIdentity(t.db, { displayName: "Ana", username: "ana" });
    await updateIdentity(t.db, a.userId, { displayName: "Ana B", username: "Ana_B", bio: "Hi" });
    const [row] =
      await t.sql`select display_name, username, bio from profiles where user_id = ${a.userId}`;
    expect(row).toEqual({ display_name: "Ana B", username: "ana_b", bio: "Hi" });
    // Keeping your own username is fine; taking someone else's is not.
    await updateIdentity(t.db, a.userId, { displayName: "Ana", username: "ana_b" });
    await expect(
      updateIdentity(t.db, a.userId, { displayName: "Ana", username: "kim_lifts" }),
    ).rejects.toThrow("That username is taken");
  });

  it("opens the profile on another device with the profile key, and can replace the key", async () => {
    const a = await createIdentity(t.db, { displayName: "Lou", username: "lou" });
    expect(await restoreWithKey(t.db, "wrong")).toBeNull();
    const restored = await restoreWithKey(t.db, a.key.toLowerCase());
    expect(restored?.userId).toBe(a.userId);
    expect(await userForToken(t.db, restored!.token)).toBe(a.userId);

    const fresh = await replaceProfileKey(t.db, a.userId);
    expect(await restoreWithKey(t.db, a.key)).toBeNull();
    expect((await restoreWithKey(t.db, fresh))?.userId).toBe(a.userId);
  });

  it("forgets one device without touching the profile", async () => {
    const a = await createIdentity(t.db, { displayName: "Max", username: "max_1" });
    await forgetDevice(t.db, a.token);
    expect(await userForToken(t.db, a.token)).toBeNull();
    const [p] = await t.sql`select username from profiles where user_id = ${a.userId}`;
    expect(p.username).toBe("max_1");
  });

  it("keeps the social handle, bio and picture the same as the profile", async () => {
    const a = await createIdentity(t.db, { displayName: "Jo", username: "jo_lifts", bio: "Bio" });
    // Whatever handle the social form sends, the username wins.
    await saveProfile(t.db, a.userId, { handle: "something_else", visibility: "private" });
    expect(await myProfile(t.db, a.userId)).toMatchObject({ handle: "jo_lifts", bio: "Bio" });

    await updateIdentity(t.db, a.userId, { displayName: "Jo", username: "jo_2", bio: "New" });
    const path = `${a.userId}/${randomUUID()}.jpg`;
    await setAvatarPath(t.db, a.userId, path);
    expect(await myProfile(t.db, a.userId)).toMatchObject({
      handle: "jo_2",
      bio: "New",
      avatarPath: path,
    });
    // The same holds when the person edits through row-level security.
    await withUser(t.db, a.userId, (tx) =>
      tx.execute(sql`update profiles set bio = 'Via RLS' where user_id = ${a.userId}`),
    );
    expect((await myProfile(t.db, a.userId))?.bio).toBe("Via RLS");

    // Leaving social features keeps the username.
    await leaveSocial(t.db, a.userId);
    expect(await myProfile(t.db, a.userId)).toBeNull();
    const [p] = await t.sql`select username from profiles where user_id = ${a.userId}`;
    expect(p.username).toBe("jo_2");
  });

  it("refuses a picture outside the person's own folder", async () => {
    const a = await createIdentity(t.db, { displayName: "Pat", username: "pat" });
    await expect(
      setAvatarPath(t.db, a.userId, `${randomUUID()}/${randomUUID()}.jpg`),
    ).rejects.toThrow(ProfileError);
  });

  it("keeps tokens away from signed-in clients", async () => {
    const a = await createIdentity(t.db, { displayName: "Ray", username: "ray" });
    await expect(
      withUser(t.db, a.userId, (tx) => tx.execute(sql`select token_hash from identity_tokens`)),
    ).rejects.toThrow();
  });

  it("deletes the profile, its tokens and everything else with the account", async () => {
    const a = await createIdentity(t.db, { displayName: "Del", username: "del_me" });
    await deleteAccount(t.db, a.userId);
    expect(await userForToken(t.db, a.token)).toBeNull();
    const rows = await t.sql`select 1 from profiles where user_id = ${a.userId}
      union all select 1 from identity_tokens where user_id = ${a.userId}`;
    expect(rows).toHaveLength(0);
    // The username is free again.
    await createIdentity(t.db, { displayName: "New", username: "del_me" });
  });
});
