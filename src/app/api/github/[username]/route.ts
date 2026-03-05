import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  const { username } = await params;
  return NextResponse.redirect(new URL(`/api/dev/${encodeURIComponent(username)}`, _request.url));
}
