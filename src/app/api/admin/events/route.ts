import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getGithubLoginFromUser, isAdminGithubLogin } from "@/lib/admin";

// Admin CRUD for Bug Invasion events.
//   GET  → list all events (newest first)
//   POST → create a scheduled event

async function requireAdmin() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const login = getGithubLoginFromUser(user);
  if (!isAdminGithubLogin(login)) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { login };
}

const SLUG_RE = /^[a-z0-9-]{3,64}$/;
const VALID_DUCK_ITEMS = new Set(["companion_duck", "duck_combatant", "duck_gold_animated", ""]);

// Template-lite: a sensible, complete 3-rail reward config. The admin form
// can override the item per tier; everything else has battle-tested defaults.
function buildRewardsConfig(rewards: unknown): Record<string, unknown> {
  const r = (rewards && typeof rewards === "object" ? rewards : {}) as Record<string, { item_id?: unknown }>;
  const pick = (v: unknown, fallback: string) =>
    typeof v === "string" && VALID_DUCK_ITEMS.has(v) ? v : fallback;
  return {
    participation: { min_damage: 100, item_id: pick(r.participation?.item_id, "companion_duck"), xp: 50 },
    milestone: {
      metric: "damage_dealt",
      tiers: [
        { id: "m1", threshold: 1000, item_id: null, xp: 50 },
        { id: "m2", threshold: 5000, item_id: pick(r.milestone_item?.item_id, "duck_combatant"), xp: 150 },
        { id: "m3", threshold: 20000, item_id: null, xp: 400 },
      ],
    },
    ranked: {
      metric: "damage_dealt",
      tiers: [
        { id: "slayer", cutoff_pct: 0.10, min_rank: 3, item_id: pick(r.slayer?.item_id, "duck_gold_animated"), xp: 1000 },
        { id: "combatant", cutoff_pct: 0.50, min_rank: 10, item_id: pick(r.combatant?.item_id, "duck_combatant"), xp: 300 },
      ],
    },
  };
}

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("event_instances")
    .select("*")
    .order("starts_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ events: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  let body: {
    slug?: unknown;
    starts_at?: unknown;
    ends_at?: unknown;
    boss_max_hp?: unknown;
    boss_name?: unknown;
    lore?: unknown;
    sponsor_brand?: unknown;
    rewards?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const slug = typeof body.slug === "string" ? body.slug.trim().toLowerCase() : "";
  if (!SLUG_RE.test(slug)) {
    return NextResponse.json({ error: "slug must be 3-64 chars [a-z0-9-]" }, { status: 400 });
  }
  const startsAt = typeof body.starts_at === "string" ? new Date(body.starts_at) : null;
  const endsAt = typeof body.ends_at === "string" ? new Date(body.ends_at) : null;
  if (!startsAt || isNaN(startsAt.getTime())) return NextResponse.json({ error: "invalid starts_at" }, { status: 400 });
  if (!endsAt || isNaN(endsAt.getTime())) return NextResponse.json({ error: "invalid ends_at" }, { status: 400 });
  if (endsAt <= startsAt) return NextResponse.json({ error: "ends_at must be after starts_at" }, { status: 400 });

  const bossMaxHp = Math.max(5000, Math.min(20_000_000, Number(body.boss_max_hp) || 50000));
  const bossName = typeof body.boss_name === "string" ? body.boss_name.slice(0, 80) : "The Original Bug";
  const lore = typeof body.lore === "string" ? body.lore.slice(0, 500) : "";
  const sponsorBrand = typeof body.sponsor_brand === "string" && body.sponsor_brand.trim()
    ? body.sponsor_brand.trim().slice(0, 80)
    : null;

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("event_instances")
    .insert({
      slug,
      kind: "boss_raid",
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      status: "scheduled",
      boss_max_hp: bossMaxHp,
      theme_config: { boss_name: bossName, lore, variant: "duck" },
      boss_config: { base_hp: bossMaxHp },
      rewards_config: buildRewardsConfig(body.rewards),
      sponsor_brand: sponsorBrand,
    })
    .select()
    .single();

  if (error) {
    const msg = error.code === "23505" ? "slug already exists" : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // Audit
  await admin.from("event_audit_log").insert({
    event_id: data.id,
    actor: auth.login ?? "unknown",
    action: "create",
    detail: { slug, boss_max_hp: bossMaxHp, starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString() },
  });

  return NextResponse.json({ event: data });
}
