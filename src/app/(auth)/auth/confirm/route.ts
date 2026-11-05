import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { audit } from "@/modules/ops/audit";

/** Landing point for the magic link email. Supports both token-hash and PKCE code links. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const supabase = await createSupabaseServerClient();

  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");

  let ok = false;
  if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  } else if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  }

  if (ok) {
    const { data } = await supabase.auth.getUser();
    if (data.user) await audit(db, data.user.id, "signed_in");
  }
  return NextResponse.redirect(new URL(ok ? "/" : "/login?error=link", origin));
}
