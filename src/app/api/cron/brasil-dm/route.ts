import { NextRequest, NextResponse } from "next/server";
import { sendBrasilDms } from "@/lib/towns/brasil-dm";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ─── Every 5 minutes: the DMs to who joined the Brasil map ──────────────────
// The next few of the queue, spaced out (brasil-dm.ts).

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await sendBrasilDms()) });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
