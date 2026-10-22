import { NextRequest, NextResponse } from "next/server";
import { recheckBrasilCities } from "@/lib/towns/brasil-recheck";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ─── Every 5 minutes: a few old comments read again for their city ──────────
// Temporary (brasil-recheck.ts): remove once no comment is left to recheck.

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await recheckBrasilCities()) });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
