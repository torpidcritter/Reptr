"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { overLimit } from "@/lib/guard";
import { log } from "@/lib/log";
import { siteUrl } from "@/lib/site-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { audit } from "@/modules/ops/audit";
import { magicLinkError } from "./errors";

export type LoginState = { status: "idle" | "sent" | "error"; message?: string; email?: string };

const emailSchema = z.email("Enter a valid email address.");
const codeSchema = z.string().regex(/^\d{6}$/, "Enter the 6-digit code from the email.");

const hash = (v: string) => createHash("sha256").update(v).digest("hex");

/** The caller's network address as Vercel reports it, hashed so it's never stored. */
async function clientRef() {
  const h = await headers();
  const ip = h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  return hash(ip);
}

export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = emailSchema.safeParse(String(formData.get("email") ?? "").trim());
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0].message };
  const email = parsed.data.toLowerCase();

  // Keyed by hashes, so the counter table never holds the email or the address.
  const busy =
    (await overLimit(hash(email), "login")) ?? (await overLimit(await clientRef(), "loginIp"));
  if (busy) return { status: "error", message: busy };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    // From configuration, never from the request's Origin or Host header.
    options: { emailRedirectTo: `${siteUrl()}/auth/confirm` },
  });

  if (error) {
    const failure = magicLinkError(error);
    // A sender that can't send is an outage, not a user mistake: report it.
    const fields = { code: error.code, status: error.status, kind: failure.kind };
    if (failure.kind === "delivery") log.error("magic_link_failed", fields);
    else log.warn("magic_link_failed", fields);
    return { status: "error", message: failure.message, email };
  }
  return { status: "sent", email };
}

/**
 * Signs in with the six-digit code from the same email. Needed where the link opens in
 * a different browser from the app, such as an installed iPhone app or a mail app's
 * own browser.
 */
export async function verifyCode(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = emailSchema.safeParse(String(formData.get("email") ?? "").trim());
  const code = codeSchema.safeParse(String(formData.get("code") ?? "").replace(/\s/g, ""));
  if (!email.success) return { status: "error", message: "Start again with your email." };
  if (!code.success) {
    return { status: "sent", email: email.data, message: code.error.issues[0].message };
  }
  const busy = await overLimit(hash(email.data.toLowerCase()), "loginCode");
  if (busy) return { status: "sent", email: email.data, message: busy };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.verifyOtp({
    email: email.data,
    token: code.data,
    type: "email",
  });
  if (error || !data.user) {
    log.warn("login_code_failed", { code: error?.code, status: error?.status });
    return {
      status: "sent",
      email: email.data,
      message: "That code is wrong or has expired. Check the latest email, or send a new one.",
    };
  }
  await audit(db, data.user.id, "signed_in");
  redirect("/");
}
