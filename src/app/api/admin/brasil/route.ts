import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isAdminUser } from "@/lib/auth-identity";
import { invalidateLeague } from "@/lib/leagues/cache";
import { getLeagueBySlug } from "@/lib/leagues/service";
import { BRASIL_SLUG, importBrasilComment, type ImportOutcome } from "@/lib/towns/brasil-server";
import { connectInstagram, instagramMedia, subscribeToComments, connectInstagramToken } from "@/lib/instagram";
import { adminAddCandidate, getElection, setRunning } from "@/lib/towns/brasil-election-server";
import { parseUF } from "@/lib/towns/brasil-map";
import { syncBrasilReels } from "@/lib/towns/brasil-instagram";
import { getBrasilResidents } from "@/lib/towns/brasil-server";
import { brasilDay, brasiliaToday, dayLine } from "@/lib/towns/brasil-day";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Most pasted comments one request imports (each may fetch GitHub). */
const MAX_LINES = 150;

async function requireAdmin() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user && isAdminUser(user) ? user : null;
}

// GET: the latest imported comments, what came of each, and the totals.
// ?view=instagram: the connected account and its latest posts, each marked watched or not.
export async function GET(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sb = getSupabaseAdmin();
  const q = new URL(req.url).searchParams;
  // ?view=day&date=2026-10-19: that day's numbers for the episode (today on Brasília time by default).
  if (q.get("view") === "day") {
    const league = await getLeagueBySlug(BRASIL_SLUG);
    if (!league) return NextResponse.json({ error: "The Brasil town isn't set up." }, { status: 404 });
    const date = /^\d{4}-\d{2}-\d{2}$/.test(q.get("date") ?? "") ? q.get("date")! : brasiliaToday();
    const day = brasilDay(await getBrasilResidents(league.id), date);
    return NextResponse.json({ ...day, line: dayLine(day) });
  }
  // ?view=election: the race as it stands (no viewer).
  if (q.get("view") === "election") {
    const league = await getLeagueBySlug(BRASIL_SLUG);
    if (!league) return NextResponse.json({ error: "The Brasil town isn't set up." }, { status: 404 });
    return NextResponse.json(await getElection(league.id, null));
  }
  // ?view=points&login=x: everything that scored for a dev, newest first.
  if (q.get("view") === "points") {
    const login = (q.get("login") ?? "").trim().replace(/^@/, "").toLowerCase();
    const { data: dev } = await sb.from("developers").select("id").eq("github_login", login).maybeSingle<{ id: number }>();
    if (!dev) return NextResponse.json({ error: `No developer @${login}.` }, { status: 404 });
    const { data: rows } = await sb.from("brasil_points").select("id, kind, points, ref, week_start, created_at").eq("developer_id", dev.id).order("created_at", { ascending: false }).limit(200);
    return NextResponse.json({ login, rows: rows ?? [] });
  }
  if (q.get("view") === "instagram") {
    const [{ data: stored }, { data: reels }] = await Promise.all([
      sb.from("instagram_account").select("username").eq("id", 1).maybeSingle<{ username: string | null }>(),
      sb.from("brasil_reels").select("media_id, permalink, watching, kind"),
    ]);
    // Not connected yet: connect with the env token, no button to press.
    let account = stored;
    let error: string | null = null;
    if (!account && process.env.INSTAGRAM_ACCESS_TOKEN) {
      try {
        const me = await connectInstagram();
        await subscribeToComments();
        account = { username: me.username };
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
    }
    // What each watched reel has brought in so far.
    const watched = (reels ?? []).filter((r: { watching: boolean }) => r.watching) as { media_id: string; permalink: string | null; kind: string }[];
    const stats: Record<string, { comments: number; added: number }> = {};
    if (watched.length) {
      const { data: rows } = await sb.from("brasil_comments").select("reel, outcome").in("reel", watched.map((r) => r.permalink ?? r.media_id));
      for (const r of (rows ?? []) as { reel: string; outcome: string }[]) {
        const s = (stats[r.reel] ??= { comments: 0, added: 0 });
        s.comments++;
        if (r.outcome === "added") s.added++;
      }
    }
    const kindOf = new Map(watched.map((r) => [r.media_id, r.kind]));
    try {
      const media = (await instagramMedia(50)).filter((m) => m.media_product_type === "REELS" || kindOf.has(m.id));
      return NextResponse.json({
        account,
        error,
        media: media.map((m) => ({ ...m, watching: kindOf.get(m.id) ?? null, stats: stats[m.permalink] ?? stats[m.id] ?? { comments: 0, added: 0 } })),
      });
    } catch (err) {
      return NextResponse.json({ account, media: [], error: err instanceof Error ? err.message : String(err) });
    }
  }
  const [{ data: comments }, { count: residents }] = await Promise.all([
    sb.from("brasil_comments").select("id, reel, ig_user, github_login, uf, outcome, created_at").order("created_at", { ascending: false }).limit(150),
    sb.from("brasil_residents").select("developer_id", { count: "exact", head: true }),
  ]);
  return NextResponse.json({ comments: comments ?? [], residents: residents ?? 0 });
}

/** One pasted line: "insta_user: the comment", or just the comment. */
function splitLine(line: string): { igUser: string | null; text: string } {
  const m = /^@?([a-z0-9._]{1,30}):\s+(.+)$/i.exec(line);
  return m ? { igUser: m[1].toLowerCase(), text: m[2] } : { igUser: null, text: line };
}

// POST { action: "import", reel, comments } | { action: "remove", login }
export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const league = await getLeagueBySlug(BRASIL_SLUG);
  if (!league || league.map !== "brasil") return NextResponse.json({ error: "The Brasil town isn't set up." }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  if (body.action === "remove") {
    const login = typeof body.login === "string" ? body.login.trim().replace(/^@/, "").toLowerCase() : "";
    const sb = getSupabaseAdmin();
    const { data: dev } = await sb.from("developers").select("id").eq("github_login", login).maybeSingle<{ id: number }>();
    if (!dev) return NextResponse.json({ error: `No developer @${login}.` }, { status: 404 });
    const { error } = await sb.from("brasil_residents").delete().eq("league_id", league.id).eq("developer_id", dev.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    invalidateLeague(league.id);
    return NextResponse.json({ removed: login });
  }

  if (body.action === "import") {
    const reel = typeof body.reel === "string" && body.reel.trim() ? body.reel.trim() : "pasted";
    const lines = (typeof body.comments === "string" ? body.comments : "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, MAX_LINES);
    const results: { line: string; outcome: ImportOutcome; login: string | null; uf: string | null }[] = [];
    for (const line of lines) {
      const { igUser, text } = splitLine(line);
      // A pasted comment has no platform id: the reel and the line stand for it, so pasting twice imports once.
      const id = `paste:${createHash("sha1").update(`${reel}\n${line}`).digest("hex")}`;
      try {
        const r = await importBrasilComment(league, { id, reel, igUser, text });
        results.push({ line, ...r });
      } catch (err) {
        console.error("[brasil] import", err);
        results.push({ line, outcome: "unknown_user", login: null, uf: null });
      }
    }
    return NextResponse.json({ results });
  }

  if (body.action === "watch") {
    const mediaId = typeof body.mediaId === "string" ? body.mediaId : "";
    if (!/^\d+$/.test(mediaId)) return NextResponse.json({ error: "Bad media id." }, { status: 400 });
    const { error } = await getSupabaseAdmin()
      .from("brasil_reels")
      .upsert({
        media_id: mediaId,
        permalink: typeof body.permalink === "string" ? body.permalink : null,
        caption: typeof body.caption === "string" ? body.caption.slice(0, 300) : null,
        // watching: "brasil" | "city" watches the post for that; anything else stops.
        watching: body.watching === "brasil" || body.watching === "city",
        ...(body.watching === "brasil" || body.watching === "city" ? { kind: body.watching } : {}),
      });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // Stores the account and its token, and turns on its comment webhooks.
  if (body.action === "connect") {
    try {
      const me = await connectInstagram();
      await subscribeToComments();
      return NextResponse.json({ username: me.username });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
    }
  }

  // A new token (one generated with the messaging permission, for stories): checked, stored, webhooks turned on again.
  if (body.action === "token") {
    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (token.length < 20) return NextResponse.json({ error: "Paste the whole token." }, { status: 400 });
    try {
      return NextResponse.json(await connectInstagramToken(token));
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
    }
  }

  // The presidential race: add someone (put on the map in `uf`, or the island, if they aren't there), or take them out.
  if (body.action === "candidate" || body.action === "uncandidate") {
    const login = typeof body.login === "string" ? body.login.trim().replace(/^@/, "").toLowerCase() : "";
    if (!/^[a-z0-9](?:[a-z0-9-]{0,38})$/.test(login)) return NextResponse.json({ error: "Bad username." }, { status: 400 });
    try {
      if (body.action === "candidate") {
        const uf = typeof body.uf === "string" && body.uf.trim() ? parseUF(body.uf.trim()) : null;
        const error = await adminAddCandidate(league, login, uf);
        if (error) return NextResponse.json({ error }, { status: 400 });
      } else {
        const { data: dev } = await getSupabaseAdmin().from("developers").select("id, github_login").eq("github_login", login).maybeSingle<{ id: number; github_login: string }>();
        if (!dev) return NextResponse.json({ error: `No developer @${login}.` }, { status: 404 });
        await setRunning(league.id, dev, false);
      }
      return NextResponse.json(await getElection(league.id, null));
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
  }

  // Takes one scored row back (abuse).
  if (body.action === "unscore") {
    const id = typeof body.id === "number" ? body.id : NaN;
    if (!Number.isInteger(id)) return NextResponse.json({ error: "Bad id." }, { status: 400 });
    const { error } = await getSupabaseAdmin().from("brasil_points").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // Reads every watched reel's comments now (the webhook's safety net, also on the cron).
  if (body.action === "sync") {
    try {
      const { data: account } = await getSupabaseAdmin().from("instagram_account").select("ig_user_id").eq("id", 1).maybeSingle<{ ig_user_id: string | null }>();
      return NextResponse.json(await syncBrasilReels(account?.ig_user_id ?? null));
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
    }
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
