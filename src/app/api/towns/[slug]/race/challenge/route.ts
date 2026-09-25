import { NextResponse } from "next/server";
import { getLeagueBySlug, getMembership, getViewer } from "@/lib/leagues/service";
import { assertSameOrigin, readJson } from "@/lib/leagues/http";
import { rateLimit } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase";
import { TRACK_ID } from "@/lib/league-city/race/track";
import { townDisplayName } from "@/lib/towns/names";
import { sendRaceChallengeNotification } from "@/lib/notification-senders/race";

export const dynamic = "force-dynamic";

// POST {login}: challenge a member of this town with your best lap (and its
// ghost). Needs a lap of your own on the board and a ghost saved; the other
// driver must be an active member. One per pair per day (the notification's
// dedup), ten an hour per sender.
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const bad = assertSameOrigin(req);
  if (bad) return bad;
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in to challenge." }, { status: 401 });
  if (!rateLimit(`race-challenge:${viewer.id}`, 10, 3_600_000).ok) return NextResponse.json({ error: "Too many challenges." }, { status: 429 });

  const body = await readJson(req);
  const login = typeof body.login === "string" ? body.login : "";
  if (!/^[A-Za-z0-9-]{1,39}$/.test(login) || login.toLowerCase() === viewer.github_login.toLowerCase()) {
    return NextResponse.json({ error: "Pick someone else." }, { status: 400 });
  }
  const { slug } = await params;
  const league = await getLeagueBySlug(slug);
  if (!league) return NextResponse.json({ error: "Town not found." }, { status: 404 });

  const sb = getSupabaseAdmin();
  const { data: target } = await sb.from("developers").select("id, github_login").ilike("github_login", login).maybeSingle();
  if (!target) return NextResponse.json({ error: "Driver not found." }, { status: 404 });
  const membership = await getMembership(league.id, target.id as number);
  if (membership?.status !== "active") return NextResponse.json({ error: "They're not in this town." }, { status: 403 });

  const { data: laps } = await sb
    .from("town_race_laps")
    .select("developer_id, best_ms")
    .eq("league_id", league.id)
    .eq("track", TRACK_ID)
    .in("developer_id", [viewer.id, target.id as number]);
  const rows = (laps ?? []) as { developer_id: number; best_ms: number }[];
  const mine = rows.find((r) => r.developer_id === viewer.id);
  if (!mine) return NextResponse.json({ error: "Set a lap first." }, { status: 409 });
  const theirs = rows.find((r) => r.developer_id === target.id) ?? null;

  const results = await sendRaceChallengeNotification({
    developerId: target.id as number,
    fromId: viewer.id,
    leagueSlug: league.slug,
    leagueName: townDisplayName(league.name),
    challengerLogin: viewer.github_login,
    theirMs: mine.best_ms,
    yourMs: theirs?.best_ms ?? null,
  });
  const sent = results.some((r) => r.success && !r.skipped);
  return NextResponse.json({ sent, already: !sent });
}
