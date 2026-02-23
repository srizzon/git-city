import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

const MIN_EVENTS = 8;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
  const before = searchParams.get("before"); // UUID cursor

  const todayOnly = searchParams.get("today") === "1";

  const sb = getSupabaseAdmin();

  // Piggyback cleanup: delete events older than 30 days (~1% chance per request)
  if (Math.random() < 0.01) {
    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
    sb.from("activity_feed").delete().lt("created_at", cutoff).then(() => {});
  }

  let query = sb
    .from("activity_feed")
    .select(`
      id,
      event_type,
      actor_id,
      target_id,
      metadata,
      created_at
    `)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (todayOnly) {
    const today = new Date().toISOString().split("T")[0];
    query = query.gte("created_at", `${today}T00:00:00Z`);
  }

  if (before) {
    // Get the created_at of the cursor event to page from there
    const { data: cursor } = await sb
      .from("activity_feed")
      .select("created_at")
      .eq("id", before)
      .single();

    if (cursor) {
      query = query.lt("created_at", cursor.created_at);
    }
  }

  let events = (await query).data ?? [];

  // If today-only returned too few, backfill with recent events (last 7 days)
  if (todayOnly && events.length < MIN_EVENTS && !before) {
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data: recent } = await sb
      .from("activity_feed")
      .select("id, event_type, actor_id, target_id, metadata, created_at")
      .gte("created_at", weekAgo)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (recent && recent.length > events.length) {
      events = recent;
    }
  }

  // If still too few real events, generate synthetic events from developer data
  if (todayOnly && events.length < MIN_EVENTS && !before) {
    const synthetic = await generateSyntheticEvents(sb, MIN_EVENTS - events.length);
    events = [...events, ...synthetic];
  }

  if (events.length === 0) {
    return NextResponse.json(
      { events: [], has_more: false },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } }
    );
  }

  // Collect all actor/target IDs to batch-fetch developer info
  const devIds = new Set<number>();
  for (const e of events) {
    if (e.actor_id) devIds.add(e.actor_id);
    if (e.target_id) devIds.add(e.target_id);
  }

  const devMap: Record<number, { login: string; avatar_url: string | null }> = {};
  if (devIds.size > 0) {
    const { data: devs } = await sb
      .from("developers")
      .select("id, github_login, avatar_url")
      .in("id", Array.from(devIds));

    for (const d of devs ?? []) {
      devMap[d.id] = { login: d.github_login, avatar_url: d.avatar_url };
    }
  }

  // Enrich events
  const enriched = events.map((e) => ({
    ...e,
    actor: e.actor_id ? devMap[e.actor_id] ?? null : null,
    target: e.target_id ? devMap[e.target_id] ?? null : null,
  }));

  return NextResponse.json(
    {
      events: enriched,
      has_more: events.length === limit,
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    }
  );
}

// ─── Synthetic Events ────────────────────────────────────────
// Generates feed items from existing developer data so the ticker
// always has content even when no real actions happened today.

async function generateSyntheticEvents(sb: ReturnType<typeof getSupabaseAdmin>, count: number) {
  const { data: devs } = await sb
    .from("developers")
    .select("id, github_login, contributions, total_stars, rank, contributions_total, current_streak, primary_language, public_repos")
    .order("contributions", { ascending: false })
    .limit(50);

  if (!devs || devs.length === 0) return [];

  const events: Array<{
    id: string;
    event_type: string;
    actor_id: number;
    target_id: number | null;
    metadata: Record<string, unknown>;
    created_at: string;
  }> = [];

  // Shuffle devs for variety
  const shuffled = [...devs].sort(() => Math.random() - 0.5);

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
        metadata: {
          login: dev.github_login,
          highlight: "contributions",
          value: dev.contributions,
        },
        created_at: new Date().toISOString(),
      });
    } else if (roll < 0.45 && dev.total_stars > 0) {
      events.push({
        id: `syn-stars-${dev.id}`,
        event_type: "dev_highlight",
        actor_id: dev.id,
        target_id: null,
        metadata: {
          login: dev.github_login,
          highlight: "stars",
          value: dev.total_stars,
        },
        created_at: new Date().toISOString(),
      });
    } else if (roll < 0.6 && dev.rank && dev.rank <= 20) {
      events.push({
        id: `syn-rank-${dev.id}`,
        event_type: "dev_highlight",
        actor_id: dev.id,
        target_id: null,
        metadata: {
          login: dev.github_login,
          highlight: "rank",
          value: dev.rank,
        },
        created_at: new Date().toISOString(),
      });
    } else if (roll < 0.75 && dev.current_streak && dev.current_streak > 0) {
      events.push({
        id: `syn-streak-${dev.id}`,
        event_type: "dev_highlight",
        actor_id: dev.id,
        target_id: null,
        metadata: {
          login: dev.github_login,
          highlight: "streak",
          value: dev.current_streak,
        },
        created_at: new Date().toISOString(),
      });
    } else if (dev.primary_language) {
      events.push({
        id: `syn-lang-${dev.id}`,
        event_type: "dev_highlight",
        actor_id: dev.id,
        target_id: null,
        metadata: {
          login: dev.github_login,
          highlight: "language",
          value: dev.primary_language,
        },
        created_at: new Date().toISOString(),
      });
    } else if (dev.public_repos > 0) {
      events.push({
        id: `syn-repos-${dev.id}`,
        event_type: "dev_highlight",
        actor_id: dev.id,
        target_id: null,
        metadata: {
          login: dev.github_login,
          highlight: "repos",
          value: dev.public_repos,
        },
        created_at: new Date().toISOString(),
      });
    }
  }

  return events;
}
