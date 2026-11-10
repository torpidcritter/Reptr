import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { log } from "@/lib/log";
import { safeNextPath, siteUrl } from "@/lib/site-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { audit } from "@/modules/ops/audit";

// Landing point for the sign-in email.
//
// Token-hash links (the recommended email template) are not used on GET. Mail scanners
// such as Outlook Safe Links open every link in an email, which would use up the one-time
// token before the person taps it. GET shows a "Continue" page instead, and only the
// POST from that page, which scanners don't send, signs in.
//
// PKCE code links still work on GET: they can only be completed by the browser that
// asked for them, so a scanner can't use them up.

const OTP_TYPES = new Set<EmailOtpType>(["email", "magiclink", "signup", "invite", "email_change"]);

const to = (path: string) => NextResponse.redirect(new URL(path, siteUrl()), 303);

async function signedIn() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) await audit(db, data.user.id, "signed_in");
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (tokenHash && type) {
    const params = new URLSearchParams({ token_hash: tokenHash, type, next });
    return to(`/auth/continue?${params}`);
  }
  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      log.warn("sign_in_link_failed", { code: error.code, status: error.status, flow: "pkce" });
      return to("/login?error=link");
    }
    await signedIn();
    return to(next);
  }
  return to("/login?error=link");
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const tokenHash = String(form.get("token_hash") ?? "");
  const type = String(form.get("type") ?? "") as EmailOtpType;
  const next = safeNextPath(String(form.get("next") ?? "/"));
  if (!tokenHash || tokenHash.length > 200 || !OTP_TYPES.has(type)) return to("/login?error=link");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) {
    log.warn("sign_in_link_failed", { code: error.code, status: error.status, flow: "token_hash" });
    return to("/login?error=link");
  }
  await signedIn();
  return to(next);
}
