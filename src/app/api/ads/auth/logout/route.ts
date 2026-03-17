import { NextResponse } from "next/server";
import { COOKIE_NAME } from "@/lib/advertiser-auth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, "", { maxAge: 0, path: "/" });
  return response;
}
