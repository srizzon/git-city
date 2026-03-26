import { NextRequest, NextResponse } from "next/server";
import { verifyAndCreateLongSession, getSessionCookieOptions } from "@/lib/advertiser-auth";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL("/ads/login?error=missing_token", request.url));
  }

  const sessionToken = await verifyAndCreateLongSession(token);

  if (!sessionToken) {
    return NextResponse.redirect(new URL("/ads/login?error=invalid_or_expired", request.url));
  }

  const redirect = request.nextUrl.searchParams.get("redirect") || "/ads/dashboard";
  const response = NextResponse.redirect(new URL(redirect, request.url));

  const cookieOptions = getSessionCookieOptions();
  response.cookies.set(cookieOptions.name, sessionToken, cookieOptions);

  return response;
}
