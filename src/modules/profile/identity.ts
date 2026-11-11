import { createHash, randomBytes } from "node:crypto";
import { and, eq, lt, ne, or, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db";
import { identityTokens, profiles } from "@/db/schema";
import { RESERVED } from "@/modules/social/social";

// Profiles without sign-in. Creating a profile makes an account row (auth.users, so every
// table that belongs to an account keeps working) and two secrets:
//
// - a device token, kept in an httpOnly cookie, which is how this browser stays "you";
// - a profile key, shown to the person once, to open the same profile on another device
//   or after clearing the browser.
//
// Only SHA-256 hashes are stored. Both are long random values, so they can't be guessed.

export class ProfileError extends Error {
  constructor(
    message: string,
    readonly field?: "displayName" | "username" | "contactEmail" | "bio" | "key",
  ) {
    super(message);
    this.name = "ProfileError";
  }
}

export const usernameSchema = z
  .string({ error: "Choose a username." })
  .trim()
  .min(1, "Choose a username.")
  .regex(/^[A-Za-z0-9_]*$/, "Use only letters, numbers and underscores, with no spaces.")
  .min(3, "Use at least 3 characters.")
  .max(20, "Use at most 20 characters.")
  .transform((u) => u.toLowerCase())
  .refine((u) => !RESERVED.has(u), "That username is reserved. Pick another.");

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .optional()
    .transform((v) => v || null);

export const identitySchema = z.object({
  displayName: z
    .string({ error: "Enter your name." })
    .trim()
    .min(1, "Enter your name.")
    .max(60, "Keep your name under 60 characters."),
  username: usernameSchema,
  contactEmail: z
    .string()
    .trim()
    .max(254, "That email is too long.")
    .optional()
    .transform((v) => v || null)
    .refine(
      (v) => v === null || z.email().safeParse(v).success,
      "Enter a valid email, or leave it blank.",
    ),
  bio: optionalText(160, "Keep your bio under 160 characters."),
});
export type IdentityInput = z.input<typeof identitySchema>;
export type Identity = z.output<typeof identitySchema>;

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** 256 random bits for the cookie. */
const deviceToken = () => randomBytes(32).toString("base64url");

// Profile keys are typed by people, so they use an alphabet without look-alikes:
// 160 random bits as 32 characters, shown in groups of four.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function profileKey() {
  const bytes = randomBytes(20);
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out.match(/.{4}/g)!.join("-");
}

/** Accepts a key typed with spaces, dashes, lowercase or look-alike letters. */
export function normalizeKey(input: string) {
  const k = input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/U/g, "V");
  return k.length === 32 ? k.match(/.{4}/g)!.join("-") : null;
}

const duplicate = (e: unknown) => {
  const err = e as { code?: string; cause?: { code?: string } };
  return err.code === "23505" || err.cause?.code === "23505";
};

const taken = () => new ProfileError("That username is taken. Pick another.", "username");

/** True when nobody else has this username (usernames are compared in lowercase). */
export async function usernameFree(db: Database, username: string, exceptUserId?: string) {
  const [row] = await db
    .select({ userId: profiles.userId })
    .from(profiles)
    .where(
      exceptUserId
        ? and(eq(profiles.username, username), ne(profiles.userId, exceptUserId))
        : eq(profiles.username, username),
    )
    .limit(1);
  return !row;
}

/**
 * Creates a profile. Returns the new account's id, the device token for the cookie and
 * the profile key to show the person once.
 */
export async function createIdentity(db: Database, input: IdentityInput) {
  const p = identitySchema.parse(input);
  if (!(await usernameFree(db, p.username))) throw taken();
  const token = deviceToken();
  const key = profileKey();
  try {
    const userId = await db.transaction(async (tx) => {
      const [{ id }] = (await tx.execute(
        sql`insert into auth.users (id) values (gen_random_uuid()) returning id`,
      )) as unknown as { id: string }[];
      // The account row's trigger has made an empty profile; fill it in.
      await tx
        .insert(profiles)
        .values({ userId: id, ...p })
        .onConflictDoUpdate({ target: profiles.userId, set: p });
      await tx.insert(identityTokens).values([
        { tokenHash: hashToken(token), userId: id, kind: "device" },
        { tokenHash: hashToken(key), userId: id, kind: "recovery" },
      ]);
      return id;
    });
    return { userId, token, key };
  } catch (e) {
    if (duplicate(e)) throw taken();
    throw e;
  }
}

/** Gives an existing account (one made before profiles, say) a username and details. */
export async function completeIdentity(db: Database, userId: string, input: IdentityInput) {
  await updateIdentity(db, userId, input);
}

/** Changes name, username, email or bio. */
export async function updateIdentity(db: Database, userId: string, input: IdentityInput) {
  const p = identitySchema.parse(input);
  if (!(await usernameFree(db, p.username, userId))) throw taken();
  try {
    await db.update(profiles).set(p).where(eq(profiles.userId, userId));
  } catch (e) {
    if (duplicate(e)) throw taken();
    throw e;
  }
}

/** Sets or clears the picture. The file must be in the person's own folder. */
export async function setAvatarPath(db: Database, userId: string, path: string | null) {
  if (path && !new RegExp(`^${userId}/[0-9a-f-]{36}\\.(jpg|jpeg|png|webp)$`).test(path))
    throw new ProfileError("That picture couldn't be saved.");
  const [before] = await db
    .select({ avatarPath: profiles.avatarPath })
    .from(profiles)
    .where(eq(profiles.userId, userId));
  await db.update(profiles).set({ avatarPath: path }).where(eq(profiles.userId, userId));
  return before?.avatarPath ?? null;
}

/** The account a cookie token belongs to, or null. */
export async function userForToken(db: Database, token: string | undefined) {
  if (!token || token.length < 32 || token.length > 128) return null;
  const hash = hashToken(token);
  const [row] = await db
    .select({ userId: identityTokens.userId, lastUsedAt: identityTokens.lastUsedAt })
    .from(identityTokens)
    .where(and(eq(identityTokens.tokenHash, hash), eq(identityTokens.kind, "device")));
  if (!row) return null;
  // Noted at most once a day, so reads don't turn into writes.
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 24 * 3600 * 1000) {
    await db
      .update(identityTokens)
      .set({ lastUsedAt: new Date() })
      .where(
        and(
          eq(identityTokens.tokenHash, hash),
          or(
            isNull(identityTokens.lastUsedAt),
            lt(identityTokens.lastUsedAt, sql`now() - interval '1 day'`),
          ),
        ),
      )
      .catch(() => {});
  }
  return row.userId;
}

/** Opens a profile with its profile key: returns a new device token, or null. */
export async function restoreWithKey(db: Database, input: string) {
  const key = normalizeKey(input);
  if (!key) return null;
  const [row] = await db
    .update(identityTokens)
    .set({ lastUsedAt: new Date() })
    .where(and(eq(identityTokens.tokenHash, hashToken(key)), eq(identityTokens.kind, "recovery")))
    .returning({ userId: identityTokens.userId });
  if (!row) return null;
  return { userId: row.userId, token: await issueDeviceToken(db, row.userId) };
}

export async function issueDeviceToken(db: Database, userId: string) {
  const token = deviceToken();
  await db.insert(identityTokens).values({ tokenHash: hashToken(token), userId, kind: "device" });
  return token;
}

/** Replaces the profile key. The old one stops working. */
export async function replaceProfileKey(db: Database, userId: string) {
  const key = profileKey();
  await db.transaction(async (tx) => {
    await tx
      .delete(identityTokens)
      .where(and(eq(identityTokens.userId, userId), eq(identityTokens.kind, "recovery")));
    await tx.insert(identityTokens).values({ tokenHash: hashToken(key), userId, kind: "recovery" });
  });
  return key;
}

/** This browser stops being the profile (the profile itself stays). */
export async function forgetDevice(db: Database, token: string | undefined) {
  if (!token) return;
  await db
    .delete(identityTokens)
    .where(and(eq(identityTokens.tokenHash, hashToken(token)), eq(identityTokens.kind, "device")));
}

/** Signs every other browser out of the profile, keeping this one. */
export async function forgetOtherDevices(db: Database, userId: string, keepToken: string) {
  await db
    .delete(identityTokens)
    .where(
      and(
        eq(identityTokens.userId, userId),
        eq(identityTokens.kind, "device"),
        ne(identityTokens.tokenHash, hashToken(keepToken)),
      ),
    );
}

export async function deviceCount(db: Database, userId: string) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(identityTokens)
    .where(and(eq(identityTokens.userId, userId), eq(identityTokens.kind, "device")));
  return row?.n ?? 0;
}
