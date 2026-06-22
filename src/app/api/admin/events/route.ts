import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getGithubLoginFromUser, isAdminGithubLogin } from "@/lib/admin";
import { getEventType, isKnownEventKind, DEFAULT_EVENT_KIND } from "@/lib/events/registry";
import { parseRewardsConfig, parseThemeConfig, parseBossConfig } from "@/lib/events/schema";

// Admin CRUD for events (any registered kind; boss_raid = duck boss).
//   GET  → list all events (newest first)
//   POST → create a scheduled event from a validated, config-driven body

async function requireAdmin() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const login = getGithubLoginFromUser(user);
  if (!isAdminGithubLogin(login)) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { login };
}

const SLUG_RE = /^[a-z0-9-]{3,64}$/;

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

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // Kind + plugin defaults
  const kind = isKnownEventKind(body.kind) ? body.kind : DEFAULT_EVENT_KIND;
  const def = getEventType(kind)!;

  // Slug + window
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

  // Theme (boss_name/lore/variant/color) — validated; variant defaults to the plugin's first.
  const themeRes = parseThemeConfig(body.theme ?? {});
  if (!themeRes.ok) return NextResponse.json({ error: themeRes.error }, { status: 400 });
  const theme = { variant: def.variants[0], ...themeRes.value };

  // Boss tuning (optional overrides; client falls back to defaults per field).
  const bossRes = parseBossConfig(body.boss_config ?? {});
  if (!bossRes.ok) return NextResponse.json({ error: bossRes.error }, { status: 400 });
  const bossConfig = { base_hp: bossMaxHp, ...bossRes.value };

  // Rewards — validated; defaults to the plugin's sensible config when omitted.
  const rewardsRes = parseRewardsConfig(body.rewards ?? def.defaultConfig());
  if (!rewardsRes.ok) return NextResponse.json({ error: rewardsRes.error }, { status: 400 });

  const autoDistribute = body.auto_distribute === undefined ? true : body.auto_distribute === true;
  const sponsorBrand = typeof body.sponsor_brand === "string" && body.sponsor_brand.trim()
    ? body.sponsor_brand.trim().slice(0, 80)
    : null;

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("event_instances")
    .insert({
      slug,
      kind,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      status: "scheduled",
      boss_max_hp: bossMaxHp,
      theme_config: theme,
      boss_config: bossConfig,
      rewards_config: rewardsRes.value,
      auto_distribute: autoDistribute,
      config_version: 1,
      sponsor_brand: sponsorBrand,
    })
    .select()
    .single();

  if (error) {
    const msg = error.code === "23505" ? "slug already exists" : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  await admin.from("event_audit_log").insert({
    event_id: data.id,
    actor: auth.login ?? "unknown",
    action: "create",
    detail: { slug, kind, boss_max_hp: bossMaxHp, auto_distribute: autoDistribute, starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString() },
  });

  return NextResponse.json({ event: data });
}
