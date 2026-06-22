import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createServerSupabase } from "@/lib/supabase-server";

const MIN_EVENTS = 8;
const FEED_COLUMNS = "id, event_type, actor_id, target_id, metadata, created_at";

// Low-signal events that flood the public city feed (equipping cosmetics over
// and over). Hidden from the global feed; still visible in personalized scopes.
const NOISE_TYPES = ["item_equipped"];

// City-feed diversity guards (first page only).
const CITY_PER_ACTOR = 2; // max events from one developer
const CITY_MIN_ACTORS = 6; // below this, blend in highlights from other devs

type FeedRow = {
  id: string;
  event_type: string;
  actor_id: number | null;
  target_id: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
  const before = searchParams.get("before"); // UUID cursor
  const todayOnly = searchParams.get("today") === "1";
  const scope = (searchParams.get("scope") ?? "city").toLowerCase();

  const sb = getSupabaseAdmin();

  // Piggyback cleanup: delete events older than 30 days (~1% chance per request)
  if (Math.random() < 0.01) {
    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
    sb.from("activity_feed").delete().lt("created_at", cutoff).then(() => {});
  }

  // ─── Personalized scopes (you / circle) ──────────────────────
  // These require a logged-in viewer and return only real events
  // about the viewer or the people they interact with. No synthetic.
  // The viewer identity comes from the authenticated session — never a
  // query param — so one user can't read another's personalized feed.
  if (scope === "you" || scope === "circle") {
    const viewer = await sessionLogin();
    if (!viewer) {
      return NextResponse.json({ events: [], has_more: false }, { headers: noStore() });
    }

    const { data: viewerDev } = await sb
      .from("developers")
      .select("id")
      .eq("github_login", viewer)
      .single();

    if (!viewerDev) {
      return NextResponse.json({ events: [], has_more: false }, { headers: noStore() });
    }

    const viewerId = viewerDev.id as number;
    const cursorTs = before ? await cursorCreatedAt(sb, before) : null;

    if (scope === "you") {
      let q = sb
        .from("activity_feed")
        .select(FEED_COLUMNS)
        .or(`actor_id.eq.${viewerId},target_id.eq.${viewerId}`)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (cursorTs) q = q.lt("created_at", cursorTs);

      const rows = ((await q).data ?? []) as FeedRow[];
      return NextResponse.json(
        { events: await enrich(sb, rows), has_more: rows.length === limit },
        { headers: noStore() }
      );
    }

    // scope === "circle": people the viewer has interacted with
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data: rel } = await sb
      .from("activity_feed")
      .select("actor_id, target_id")
      .or(`actor_id.eq.${viewerId},target_id.eq.${viewerId}`)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(300);

    const relatedIds = new Set<number>();
    for (const r of rel ?? []) {
      if (r.actor_id && r.actor_id !== viewerId) relatedIds.add(r.actor_id);
      if (r.target_id && r.target_id !== viewerId) relatedIds.add(r.target_id);
    }

    if (relatedIds.size === 0) {
      return NextResponse.json({ events: [], has_more: false }, { headers: noStore() });
    }

    const idList = Array.from(relatedIds).join(",");
    let q = sb
      .from("activity_feed")
      .select(FEED_COLUMNS)
      .or(`actor_id.in.(${idList}),target_id.in.(${idList})`)
      .order("created_at", { ascending: false })
      .limit(limit + 10); // fetch a few extra to absorb self-filtering
    if (cursorTs) q = q.lt("created_at", cursorTs);

    const raw = ((await q).data ?? []) as FeedRow[];
    // Drop events where the viewer is the only party (those belong to "You")
    const rows = raw
      .filter((e) => e.actor_id !== viewerId && e.target_id !== viewerId)
      .slice(0, limit);

    return NextResponse.json(
      { events: await enrich(sb, rows), has_more: raw.length > limit },
      { headers: noStore() }
    );
  }

  // ─── Global "city" scope (default) ───────────────────────────
  // Over-fetch on the first page so we can drop noise, cap per-actor and
  // blend in highlights for variety. Paginated pages stay simple.
  const fetchLimit = before ? limit : Math.min(150, limit * 4);

  let query = sb
    .from("activity_feed")
    .select(FEED_COLUMNS)
    .not("event_type", "in", `(${NOISE_TYPES.join(",")})`)
    .order("created_at", { ascending: false })
    .limit(fetchLimit);

  if (todayOnly) {
    const today = new Date().toISOString().split("T")[0];
    query = query.gte("created_at", `${today}T00:00:00Z`);
  }

  if (before) {
    const cursorTs = await cursorCreatedAt(sb, before);
    if (cursorTs) query = query.lt("created_at", cursorTs);
  }

  let events = ((await query).data ?? []) as FeedRow[];

  // If today-only returned too few, backfill with recent events (last 7 days)
  if (todayOnly && events.length < MIN_EVENTS && !before) {
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data: recent } = await sb
      .from("activity_feed")
      .select(FEED_COLUMNS)
      .not("event_type", "in", `(${NOISE_TYPES.join(",")})`)
      .gte("created_at", weekAgo)
      .order("created_at", { ascending: false })
      .limit(fetchLimit);

    if (recent && recent.length > events.length) {
      events = recent as FeedRow[];
    }
  }

  const rawCount = events.length;

  // First page only: keep the feed feeling like a city, not one person's diary.
  if (!before) {
    events = capPerActor(events, CITY_PER_ACTOR);

    // If a single tester dominates (low variety) or the city is quiet, blend in
    // real highlights from other developers so the feed always feels alive.
    const distinctActors = new Set(events.map((e) => e.actor_id)).size;
    if (events.length < MIN_EVENTS || distinctActors < CITY_MIN_ACTORS) {
      const exclude = new Set(events.map((e) => e.actor_id).filter((id): id is number => id != null));
      const synthetic = await generateSyntheticEvents(sb, limit, exclude);
      events = dedupeRows([...events, ...synthetic]);
    }

    events = events.slice(0, limit);
  }

  if (events.length === 0) {
    return NextResponse.json({ events: [], has_more: false }, { headers: cacheable() });
  }

  return NextResponse.json(
    { events: await enrich(sb, events), has_more: before ? rawCount === limit : rawCount >= fetchLimit },
    { headers: cacheable() }
  );
}

// ─── Helpers ─────────────────────────────────────────────────

// The authenticated viewer's GitHub login, or null if not signed in. This is
// the ONLY source of identity for personalized scopes — the client can't spoof
// another user by passing a `viewer` param.
async function sessionLogin(): Promise<string | null> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const login = (
    user.user_metadata.user_name ??
    user.user_metadata.preferred_username ??
    ""
  )
    .toLowerCase()
    .trim();
  return login || null;
}

function cacheable() {
  return { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" };
}

// Personalized scopes must never be cached at the edge (per-user data).
function noStore() {
  return { "Cache-Control": "private, no-store" };
}

// Keep at most `max` events per actor, preserving recency order.
function capPerActor(events: FeedRow[], max: number): FeedRow[] {
  const counts = new Map<number, number>();
  const out: FeedRow[] = [];
  for (const e of events) {
    const key = e.actor_id ?? -1;
    const c = counts.get(key) ?? 0;
    if (c >= max) continue;
    counts.set(key, c + 1);
    out.push(e);
  }
  return out;
}

function dedupeRows(events: FeedRow[]): FeedRow[] {
  const seen = new Set<string>();
  const out: FeedRow[] = [];
  for (const e of events) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e);
  }
  return out;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function cursorCreatedAt(
  sb: ReturnType<typeof getSupabaseAdmin>,
  cursorId: string
): Promise<string | null> {
  // The `id` column is a UUID. A non-UUID cursor (e.g. a synthetic `syn-…` id
  // that slipped through) would raise 22P02 server-side, so reject it early and
  // page from the top instead.
  if (!UUID_RE.test(cursorId)) return null;
  const { data } = await sb
    .from("activity_feed")
    .select("created_at")
    .eq("id", cursorId)
    .single();
  return data?.created_at ?? null;
}

// Batch-fetch developer info and attach actor/target to each event.
async function enrich(sb: ReturnType<typeof getSupabaseAdmin>, events: FeedRow[]) {
  const devIds = new Set<number>();
  for (const e of events) {
    if (e.actor_id) devIds.add(e.actor_id);
    if (e.target_id) devIds.add(e.target_id);
  }

  const devMap: Record<
    number,
    { login: string; avatar_url: string | null; level: number | null; rank: number | null }
  > = {};
  if (devIds.size > 0) {
    const { data: devs } = await sb
      .from("developers")
      .select("id, github_login, avatar_url, xp_level, rank")
      .in("id", Array.from(devIds));

    for (const d of devs ?? []) {
      devMap[d.id] = {
        login: d.github_login,
        avatar_url: d.avatar_url,
        level: d.xp_level ?? null,
        rank: d.rank ?? null,
      };
    }
  }

  return events.map((e) => ({
    ...e,
    actor: e.actor_id ? devMap[e.actor_id] ?? null : null,
    target: e.target_id ? devMap[e.target_id] ?? null : null,
  }));
}

// ─── Synthetic Events ────────────────────────────────────────
// Generates feed items from existing developer data so the global
// ticker always has content even when no real actions happened today.
// Only used for the "city" scope.

async function generateSyntheticEvents(
  sb: ReturnType<typeof getSupabaseAdmin>,
  count: number,
  exclude?: Set<number>
) {
  const { data: devs } = await sb
    .from("developers")
    .select("id, github_login, contributions, total_stars, rank, contributions_total, current_streak, primary_language, public_repos")
    .order("contributions", { ascending: false })
    .limit(60);

  if (!devs || devs.length === 0) return [];

  const events: FeedRow[] = [];

  // Shuffle devs for variety, skipping anyone already dominating the feed.
  const shuffled = [...devs]
    .filter((d) => !exclude?.has(d.id))
    .sort(() => Math.random() - 0.5);

  for (const dev of shuffled) {
    if (events.length >= count) break;

    // Pick a random synthetic event type for each dev
    const roll = Math.random();

    if (roll < 0.25 && dev.contributions > 0) {
      events.push({
        id: `syn-contrib-${dev.id}`,
        event_type: "dev_highlight",
        actor_id: dev.id,
        target_id: null,
        metadata: { login: dev.github_login, highlight: "contributions", value: dev.contributions },
        created_at: new Date().toISOString(),
      });
    } else if (roll < 0.45 && dev.total_stars > 0) {
      events.push({
        id: `syn-stars-${dev.id}`,
        event_type: "dev_highlight",
        actor_id: dev.id,
        target_id: null,
        metadata: { login: dev.github_login, highlight: "stars", value: dev.total_stars },
        created_at: new Date().toISOString(),
      });
    } else if (roll < 0.6 && dev.rank && dev.rank <= 20) {
      events.push({
        id: `syn-rank-${dev.id}`,
        event_type: "dev_highlight",
        actor_id: dev.id,
        target_id: null,
        metadata: { login: dev.github_login, highlight: "rank", value: dev.rank },
        created_at: new Date().toISOString(),
      });
    } else if (roll < 0.75 && dev.current_streak && dev.current_streak > 0) {
      events.push({
        id: `syn-streak-${dev.id}`,
        event_type: "dev_highlight",
        actor_id: dev.id,
        target_id: null,
        metadata: { login: dev.github_login, highlight: "streak", value: dev.current_streak },
        created_at: new Date().toISOString(),
      });
    } else if (dev.primary_language) {
      events.push({
        id: `syn-lang-${dev.id}`,
        event_type: "dev_highlight",
        actor_id: dev.id,
        target_id: null,
        metadata: { login: dev.github_login, highlight: "language", value: dev.primary_language },
        created_at: new Date().toISOString(),
      });
    } else if (dev.public_repos > 0) {
      events.push({
        id: `syn-repos-${dev.id}`,
        event_type: "dev_highlight",
        actor_id: dev.id,
        target_id: null,
        metadata: { login: dev.github_login, highlight: "repos", value: dev.public_repos },
        created_at: new Date().toISOString(),
      });
    }
  }

  return events;
}
