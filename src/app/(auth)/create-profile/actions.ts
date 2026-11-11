"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { getProfile, getUser } from "@/lib/auth";
import { clientIpKey } from "@/lib/client-ip";
import { overLimit } from "@/lib/guard";
import { IDENTITY_COOKIE, identityCookieOptions, JUST_CREATED_COOKIE } from "@/lib/identity-cookie";
import { log } from "@/lib/log";
import { audit } from "@/modules/ops/audit";
import { fieldsFrom, formErrors, type IdentityFormState } from "@/modules/profile/form";
import {
  createIdentity,
  forgetDevice,
  restoreWithKey,
  updateIdentity,
  usernameFree,
  usernameSchema,
} from "@/modules/profile/identity";

export type CreateState = IdentityFormState & {
  created?: { username: string; displayName: string; key: string | null };
};

/**
 * Creates the profile and makes this browser it. An account from before profiles
 * existed (it has no username yet) is completed instead of a second one being made.
 */
export async function createProfileAction(
  _prev: CreateState,
  form: FormData,
): Promise<CreateState> {
  const values = fieldsFrom(form);
  const existing = await getUser();
  if (existing && (await getProfile(existing.id))?.username) redirect("/");

  const busy = await overLimit(existing?.id ?? `ip:${await clientIpKey()}`, "profileCreate");
  if (busy) return { error: busy, values };
  try {
    if (existing) {
      await updateIdentity(db, existing.id, values);
      await audit(db, existing.id, "profile_updated");
      const p = await getProfile(existing.id);
      return {
        ok: true,
        values,
        created: { username: p!.username!, displayName: p!.displayName!, key: null },
      };
    }
    const made = await createIdentity(db, values);
    const jar = await cookies();
    jar.set(IDENTITY_COOKIE, made.token, identityCookieOptions());
    // Setting a cookie re-renders this page; this lets it show the success screen
    // instead of moving on before the person has seen their profile key.
    jar.set(JUST_CREATED_COOKIE, "1", { ...identityCookieOptions(), maxAge: 300 });
    await audit(db, made.userId, "profile_created");
    const username = usernameSchema.parse(values.username);
    return {
      ok: true,
      values,
      created: { username, displayName: values.displayName.trim(), key: made.key },
    };
  } catch (e) {
    const shown = formErrors(e);
    if (shown) return { ...shown, values };
    log.error("profile_create_failed", { err: e });
    return { error: "Your profile couldn't be created. Try again.", values };
  }
}

/** Live feedback while typing a username. */
export async function checkUsernameAction(
  input: string,
): Promise<{ error?: string; ok?: boolean }> {
  const parsed = usernameSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const busy = await overLimit(`ip:${await clientIpKey()}`, "usernameCheck");
  if (busy) return {};
  const me = await getUser();
  return (await usernameFree(db, parsed.data, me?.id))
    ? { ok: true }
    : { error: "That username is taken. Pick another." };
}

export type OpenState = { error?: string };

/** Opens an existing profile on this browser with its profile key. */
export async function openProfileAction(_prev: OpenState, form: FormData): Promise<OpenState> {
  const busy = await overLimit(`ip:${await clientIpKey()}`, "profileOpen");
  if (busy) return { error: busy };
  const opened = await restoreWithKey(db, String(form.get("key") ?? ""));
  if (!opened) return { error: "That profile key didn't match a profile. Check it and try again." };
  const jar = await cookies();
  await forgetDevice(db, jar.get(IDENTITY_COOKIE)?.value);
  jar.set(IDENTITY_COOKIE, opened.token, identityCookieOptions());
  await audit(db, opened.userId, "profile_opened");
  redirect("/");
}

/** Leaves the success screen for the app. */
export async function continueAction() {
  (await cookies()).delete(JUST_CREATED_COOKIE);
  redirect("/");
}
