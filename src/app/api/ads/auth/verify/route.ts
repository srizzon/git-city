import { NextRequest, NextResponse } from "next/server";
import { verifyAndCreateLongSession, getSessionCookieOptions } from "@/lib/advertiser-auth";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const redirect = request.nextUrl.searchParams.get("redirect");

  if (!token) {
    const loginUrl = new URL("/business/login", request.url);
    loginUrl.searchParams.set("error", "missing_token");
    if (redirect) loginUrl.searchParams.set("redirect", redirect);
    return NextResponse.redirect(loginUrl);
  }

  const sessionToken = await verifyAndCreateLongSession(token);

  if (!sessionToken) {
    const loginUrl = new URL("/business/login", request.url);
    loginUrl.searchParams.set("error", "invalid_or_expired");
    if (redirect) loginUrl.searchParams.set("redirect", redirect);
    return NextResponse.redirect(loginUrl);
  }

  const destination = redirect || "/ads/dashboard";
  const response = NextResponse.redirect(new URL(destination, request.url));

  const cookieOptions = getSessionCookieOptions();
  response.cookies.set(cookieOptions.name, sessionToken, cookieOptions);

  return response;
}
