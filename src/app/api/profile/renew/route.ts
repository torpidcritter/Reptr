import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { IDENTITY_COOKIE, identityCookieOptions } from "@/lib/identity-cookie";
import { userForToken } from "@/modules/profile/identity";

/**
 * Renews the profile cookie so it never expires while the app is in use. Called by the
 * app about once a day (see ProfileCookieRenewer). Only a cookie that still belongs to a
 * profile is renewed.
 */
export async function POST(request: NextRequest) {
  const token = request.cookies.get(IDENTITY_COOKIE)?.value;
  if (!(await userForToken(db, token))) return new NextResponse(null, { status: 204 });
  const res = new NextResponse(null, { status: 204 });
  res.cookies.set(IDENTITY_COOKIE, token!, identityCookieOptions());
  return res;
}
