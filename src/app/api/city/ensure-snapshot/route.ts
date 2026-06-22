import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const maxDuration = 300;

const STORAGE_BUCKET = "city-data";
const STORAGE_PATH = "snapshot.json";

// Dedupe concurrent build requests across this server instance: many browsers
// hitting a fresh environment at once should trigger exactly one build.
let inFlight: Promise<unknown> | null = null;

/** True when the snapshot object already exists in storage. */
async function snapshotExists(sb: ReturnType<typeof getSupabaseAdmin>): Promise<boolean> {
  const { data, error } = await sb.storage
    .from(STORAGE_BUCKET)
    .list("", { search: STORAGE_PATH });
  // Missing bucket → error → treat as "does not exist" so we build it.
  if (error) return false;
  return (data ?? []).some((f) => f.name === STORAGE_PATH);
}

/**
 * Self-healing endpoint: makes sure `city-data/snapshot.json` exists.
 *
 * Production keeps the snapshot fresh via the Vercel cron, so this is a cheap
 * existence check that no-ops there. On a fresh environment (local, a reset
 * staging DB, a new preview) the snapshot/bucket won't exist yet — this calls
 * the existing snapshot cron internally (server-side, with the CRON_SECRET) to
 * generate it on demand. The frontend calls this when its snapshot fetch 404s,
 * then retries, so a brand-new environment renders the city without anyone
 * having to trigger the cron by hand.
 */
export async function GET(request: NextRequest) {
  const sb = getSupabaseAdmin();

  if (await snapshotExists(sb)) {
    return NextResponse.json({ ok: true, existed: true });
  }

  if (!inFlight) {
    const origin = new URL(request.url).origin;
    inFlight = fetch(`${origin}/api/cron/city-snapshot`, {
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`snapshot cron failed: ${res.status} ${await res.text()}`);
        }
        return res.json();
      })
      .finally(() => {
        inFlight = null;
      });
  }

  try {
    const result = await inFlight;
    return NextResponse.json({ ok: true, generated: true, result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "snapshot build failed" },
      { status: 500 },
    );
  }
}
