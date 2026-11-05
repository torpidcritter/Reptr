"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { z } from "zod";
import { overLimit } from "@/lib/guard";
import { log } from "@/lib/log";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type LoginState = { status: "idle" | "sent" | "error"; message?: string; email?: string };

const emailSchema = z.email("Enter a valid email address.");

export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = emailSchema.safeParse(String(formData.get("email") ?? "").trim());
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0].message };

  // Keyed by a hash of the address, so the counter table never holds the email itself.
  const subject = createHash("sha256").update(parsed.data.toLowerCase()).digest("hex");
  const busy = await overLimit(subject, "login");
  if (busy) return { status: "error", message: busy };

  const h = await headers();
  const origin = h.get("origin") ?? `https://${h.get("host")}`;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: { emailRedirectTo: `${origin}/auth/confirm` },
  });

  if (error) log.warn("magic_link_failed", { code: error.code, status: error.status });
  if (error) return { status: "error", message: "Couldn't send the link. Try again in a minute." };
  return { status: "sent", email: parsed.data };
}
