import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// The reels readout, for the scheduled Claude task that judges posted reels from
// the cloud (Sam's personal account, no Mac on): it reads each posted reel's
// latest numbers and writes back one verdict per reel, shown in /admin/reels.
// Bearer READOUT_SECRET only, nothing else: no captions in full, no tokens, no
// user data, and the only write is the verdict inside the reel's own meta.
//
// GET ?days=14: posted reels of the last `days` (max 30) with their latest numbers.
// POST { readouts: [{ id, verdict, winner? }] }: at most 20, a verdict at most 600 characters.

const MAX_DAYS = 30;
const MAX_READOUTS = 20;
const MAX_VERDICT = 600;

function authorized(req: Request): boolean {
  const secret = process.env.READOUT_SECRET;
  // A short or missing secret turns the endpoint off rather than leaving it guessable.
  if (!secret || secret.length < 32) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const asked = Number(new URL(req.url).searchParams.get("days") ?? 14);
  const days = Number.isFinite(asked) ? Math.min(MAX_DAYS, Math.max(1, Math.round(asked))) : 14;
  const sb = getSupabaseAdmin();
  const { data: rows, error } = await sb
    .from("reel_schedule")
    .select("id, spec_id, kind, caption, scheduled_at, media_id, permalink, meta")
    .eq("status", "posted")
    .gte("scheduled_at", new Date(Date.now() - days * 86_400_000).toISOString())
    .order("scheduled_at");
  if (error) return NextResponse.json({ error: "Read failed." }, { status: 500 });
  const media = (rows ?? []).map((r) => r.media_id).filter(Boolean) as string[];
  const { data: stats } = media.length
    ? await sb
        .from("reel_stats")
        .select("media_id, taken_at, views, reach, likes, comments, shares, saved, avg_watch_ms, skip_rate, devs_placed")
        .in("media_id", media)
        .order("taken_at", { ascending: false })
    : { data: [] };
  const latest = new Map<string, Record<string, unknown>>();
  for (const s of stats ?? []) if (!latest.has(s.media_id)) latest.set(s.media_id, s);
  const now = Date.now();
  return NextResponse.json({
    reels: (rows ?? []).map((r) => {
      const meta = (r.meta ?? {}) as { hook?: string; length_s?: number; readout?: unknown };
      const s = r.media_id ? latest.get(r.media_id) : undefined;
      return {
        id: r.id,
        name: r.spec_id,
        kind: r.kind,
        posted_at: r.scheduled_at,
        age_hours: Math.round((now - Date.parse(r.scheduled_at)) / 3_600_000),
        permalink: r.permalink,
        caption: (r.caption ?? "").slice(0, 200),
        hook: meta.hook ?? null,
        length_s: meta.length_s ?? null,
        readout: meta.readout ?? null,
        stats: s ? { ...s, media_id: undefined } : null,
      };
    }),
  });
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { readouts?: { id?: unknown; verdict?: unknown; winner?: unknown }[] } | null;
  const list = Array.isArray(body?.readouts) ? body.readouts : [];
  if (!list.length || list.length > MAX_READOUTS) return NextResponse.json({ error: `Send 1 to ${MAX_READOUTS} readouts.` }, { status: 400 });
  const sb = getSupabaseAdmin();
  const at = new Date().toISOString();
  let written = 0;
  for (const r of list) {
    if (typeof r.id !== "string" || !/^[0-9a-f-]{36}$/.test(r.id) || typeof r.verdict !== "string") continue;
    const verdict = r.verdict.trim().slice(0, MAX_VERDICT);
    if (!verdict) continue;
    const { data: row } = await sb.from("reel_schedule").select("id, meta").eq("id", r.id).eq("status", "posted").maybeSingle<{ id: string; meta: Record<string, unknown> | null }>();
    if (!row) continue;
    const { error } = await sb
      .from("reel_schedule")
      .update({ meta: { ...(row.meta ?? {}), readout: { at, verdict, winner: r.winner === true } } })
      .eq("id", row.id);
    if (!error) written++;
  }
  return NextResponse.json({ ok: true, written });
}
