import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isAdminUser } from "@/lib/auth-identity";
import { BUCKET, type ScheduleRow } from "@/lib/reel/publish";

export const dynamic = "force-dynamic";

// The reels agenda (admin): the scheduled and posted reels of a week with
// their latest numbers, and moving, cancelling, posting now or retrying one.
//
// GET ?from=2026-10-19: the 7 days from that date (Brasília), default this week.
// POST { action: "move", id, at } | { action: "cancel", id } | { action: "now", id } | { action: "retry", id }

async function requireAdmin() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user && isAdminUser(user) ? user : null;
}

export interface AgendaStats {
  views: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saved: number | null;
  avg_watch_ms: number | null;
  skip_rate: number | null;
  devs_placed: number | null;
  taken_at: string;
}

export async function GET(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sb = getSupabaseAdmin();
  const asked = new URL(req.url).searchParams.get("from");
  const from = /^\d{4}-\d{2}-\d{2}$/.test(asked ?? "") ? new Date(`${asked}T00:00:00-03:00`) : new Date(Date.now() - 2 * 86_400_000);
  const to = new Date(from.getTime() + 7 * 86_400_000);
  const { data: rows, error } = await sb
    .from("reel_schedule")
    .select("id, spec_id, kind, caption, scheduled_at, status, attempts, error, media_id, permalink, meta, updated_at")
    .gte("scheduled_at", from.toISOString())
    .lt("scheduled_at", to.toISOString())
    .neq("status", "cancelled")
    .order("scheduled_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const media = (rows ?? []).map((r) => r.media_id).filter(Boolean) as string[];
  const { data: stats } = media.length
    ? await sb.from("reel_stats").select("*").in("media_id", media).order("taken_at", { ascending: false })
    : { data: [] };
  const latest = new Map<string, AgendaStats>();
  for (const s of stats ?? []) if (!latest.has(s.media_id)) latest.set(s.media_id, s as AgendaStats);
  const { data: posts } = media.length ? await sb.from("reel_posts").select("media_id, graduated").in("media_id", media) : { data: [] };
  const graduated = new Map((posts ?? []).map((p) => [p.media_id as string, p.graduated as boolean]));
  return NextResponse.json({
    from: from.toISOString(),
    reels: (rows ?? []).map((r) => ({ ...r, stats: r.media_id ? (latest.get(r.media_id) ?? null) : null, graduated: r.media_id ? (graduated.get(r.media_id) ?? false) : false })),
  });
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sb = getSupabaseAdmin();
  const body = (await req.json().catch(() => ({}))) as { action?: string; id?: string; at?: string };
  if (!body.id) return NextResponse.json({ error: "No reel." }, { status: 400 });
  const { data: row } = await sb.from("reel_schedule").select("*").eq("id", body.id).maybeSingle<ScheduleRow>();
  if (!row) return NextResponse.json({ error: "No such reel." }, { status: 404 });
  const now = new Date().toISOString();
  const waiting = row.status === "scheduled" || row.status === "failed";

  if (body.action === "move") {
    const at = body.at ? new Date(body.at) : null;
    if (!waiting || !at || Number.isNaN(at.getTime())) return NextResponse.json({ error: "Only a reel still waiting can move, to a valid time." }, { status: 400 });
    await sb.from("reel_schedule").update({ scheduled_at: at.toISOString(), updated_at: now }).eq("id", row.id);
  } else if (body.action === "now") {
    if (!waiting) return NextResponse.json({ error: "This reel isn't waiting." }, { status: 400 });
    // The publish cron takes it on its next run (within 5 minutes).
    await sb.from("reel_schedule").update({ scheduled_at: now, status: "scheduled", attempts: 0, error: null, updated_at: now }).eq("id", row.id);
  } else if (body.action === "retry") {
    if (row.status !== "failed") return NextResponse.json({ error: "Only a failed reel is retried." }, { status: 400 });
    await sb.from("reel_schedule").update({ status: "scheduled", attempts: 0, error: null, container_id: null, updated_at: now }).eq("id", row.id);
  } else if (body.action === "cancel") {
    if (!waiting) return NextResponse.json({ error: "Only a reel still waiting can be cancelled." }, { status: 400 });
    await sb.from("reel_schedule").update({ status: "cancelled", updated_at: now }).eq("id", row.id);
    await sb.storage.from(BUCKET).remove([row.video_path, ...(row.cover_path ? [row.cover_path] : [])]);
  } else {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
