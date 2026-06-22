import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getGithubLoginFromUser, isAdminGithubLogin } from "@/lib/admin";

// Full cosmetic catalog for the admin gallery (management is complete even
// for items that don't yet have a 3D preview).

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!isAdminGithubLogin(getGithubLoginFromUser(user))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  // select("*") returns whatever columns exist — so this works whether or
  // not migration 094 (the `rarity` column) has run yet. Missing columns
  // simply come back undefined; the gallery treats absent rarity as "—".
  const [itemsRes, setsRes, seasonsRes] = await Promise.all([
    admin.from("items").select("*").order("zone", { ascending: true }).order("name", { ascending: true }),
    admin.from("cosmetic_sets").select("id,name,description,sort_order").order("sort_order", { ascending: true }),
    admin.from("cosmetic_seasons").select("id,name,starts_at,ends_at,sort_order").order("sort_order", { ascending: true }),
  ]);

  if (itemsRes.error) return NextResponse.json({ error: itemsRes.error.message }, { status: 500 });
  return NextResponse.json({
    items: itemsRes.data ?? [],
    sets: setsRes.data ?? [],
    seasons: seasonsRes.data ?? [],
  });
}

// Create a new cosmetic. Starts as draft (is_active=false) so it never reaches
// players until approved. Adding a cosmetic is now this single call + (for
// asset/template kinds) the render_spec — no code change.
const ID_RE = /^[a-z0-9_]{2,48}$/;

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!isAdminGithubLogin(getGithubLoginFromUser(user))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let b: Record<string, unknown>;
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  const id = String(b.id ?? "").trim();
  if (!ID_RE.test(id)) return NextResponse.json({ error: "id must be lowercase a-z 0-9 _ (2-48 chars)" }, { status: 400 });

  const renderKind = ["code", "asset", "template"].includes(String(b.render_kind)) ? String(b.render_kind) : "asset";
  const slot = ["crown", "roof", "aura", "faces"].includes(String(b.zone)) ? String(b.zone) : null;
  const shopSection = ["building", "battle", "boost"].includes(String(b.shop_section)) ? String(b.shop_section) : null;

  const row = {
    id,
    name: String(b.name ?? id).slice(0, 120),
    description: b.description ? String(b.description).slice(0, 600) : null,
    category: "effect",
    zone: slot,
    shop_section: shopSection,
    render_kind: renderKind,
    render_spec: (b.render_spec && typeof b.render_spec === "object") ? b.render_spec : (renderKind === "code" ? { key: id } : {}),
    // Free-form item metadata (e.g. { type: "raid_vehicle", emoji: "🏦" } for
    // vehicles). Kept generic so any item shape is authorable from the panel.
    metadata: (b.metadata && typeof b.metadata === "object" && !Array.isArray(b.metadata)) ? b.metadata : {},
    rarity: ["common", "rare", "epic", "legendary"].includes(String(b.rarity)) ? String(b.rarity) : "common",
    tags: Array.isArray(b.tags) ? (b.tags as unknown[]).filter((t) => typeof t === "string").slice(0, 24) : [],
    set_id: b.set_id ? String(b.set_id) : null,
    season_id: b.season_id ? String(b.season_id) : null,
    price_pixels: typeof b.price_pixels === "number" ? b.price_pixels : null,
    price_usd_cents: typeof b.price_usd_cents === "number" ? b.price_usd_cents : 0,
    price_brl_cents: typeof b.price_brl_cents === "number" ? b.price_brl_cents : 0,
    is_active: false,
  };

  const admin = getSupabaseAdmin();
  const { error } = await admin.from("items").insert(row);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, item: row });
}
