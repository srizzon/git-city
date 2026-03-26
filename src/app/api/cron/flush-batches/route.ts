import { NextRequest, NextResponse } from "next/server";
import { flushPendingBatches } from "@/lib/notifications";

/**
 * Cron: Every 15 minutes - Flush closed notification batches.
 * Compiles digest emails for batched events (raids, achievements, etc).
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const flushed = await flushPendingBatches();
    return NextResponse.json({ ok: true, batches_flushed: flushed });
  } catch (err) {
    console.error("[cron:flush-batches] Error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
