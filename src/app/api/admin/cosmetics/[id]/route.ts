import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getGithubLoginFromUser, isAdminGithubLogin } from "@/lib/admin";

// Edit a cosmetic. The "approve → live" gate (is_active) plus all catalog
// metadata: render strategy, set/season, tags, pricing, availability window.
// Nothing reaches players until is_active is flipped on here.

const RARITIES = ["common", "rare", "epic", "legendary"];
const SLOTS = ["crown", "roof", "aura", "faces"];
const RENDER_KINDS = ["code", "asset", "template"];
const SHOP_SECTIONS = ["building", "battle", "boost"];

async function requireAdmin() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  if (!isAdminGithubLogin(getGithubLoginFromUser(user))) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { error: null };
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { error: authErr } = await requireAdmin();
  if (authErr) return authErr;

  const { id } = await ctx.params;
  let b: Record<string, unknown>;
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  const patch: Record<string, unknown> = {};

  if (typeof b.is_active === "boolean") patch.is_active = b.is_active;
  if (typeof b.name === "string") patch.name = b.name.slice(0, 120);
  if (b.description !== undefined) patch.description = b.description === null ? null : String(b.description).slice(0, 600);
  if (typeof b.thumbnail_url === "string") patch.thumbnail_url = b.thumbnail_url;
  if (typeof b.sort_order === "number" && Number.isInteger(b.sort_order)) patch.sort_order = b.sort_order;

  if (b.rarity !== undefined) {
    if (b.rarity === null || b.rarity === "") patch.rarity = null;
    else if (typeof b.rarity === "string" && RARITIES.includes(b.rarity)) patch.rarity = b.rarity;
    else return NextResponse.json({ error: "invalid rarity" }, { status: 400 });
  }
  if (b.zone !== undefined) {
    if (b.zone === null || b.zone === "") patch.zone = null;
    else if (typeof b.zone === "string" && SLOTS.includes(b.zone)) patch.zone = b.zone;
    else return NextResponse.json({ error: "invalid slot" }, { status: 400 });
  }
  if (b.render_kind !== undefined) {
    if (typeof b.render_kind === "string" && RENDER_KINDS.includes(b.render_kind)) patch.render_kind = b.render_kind;
    else return NextResponse.json({ error: "invalid render_kind" }, { status: 400 });
  }
  if (b.render_spec !== undefined) {
    if (b.render_spec && typeof b.render_spec === "object") patch.render_spec = b.render_spec;
    else return NextResponse.json({ error: "invalid render_spec" }, { status: 400 });
  }
  if (b.shop_section !== undefined) {
    if (b.shop_section === null || b.shop_section === "") patch.shop_section = null;
    else if (typeof b.shop_section === "string" && SHOP_SECTIONS.includes(b.shop_section)) patch.shop_section = b.shop_section;
    else return NextResponse.json({ error: "invalid shop_section" }, { status: 400 });
  }
  if (b.metadata !== undefined) {
    if (b.metadata && typeof b.metadata === "object" && !Array.isArray(b.metadata)) patch.metadata = b.metadata;
    else return NextResponse.json({ error: "invalid metadata" }, { status: 400 });
  }
  if (b.tags !== undefined) {
    if (Array.isArray(b.tags) && b.tags.every((t) => typeof t === "string")) patch.tags = (b.tags as string[]).map((t) => t.trim()).filter(Boolean).slice(0, 24);
    else return NextResponse.json({ error: "invalid tags" }, { status: 400 });
  }
  if (b.set_id !== undefined) patch.set_id = b.set_id === "" ? null : b.set_id;
  if (b.season_id !== undefined) patch.season_id = b.season_id === "" ? null : b.season_id;
  if (b.available_from !== undefined) patch.available_from = b.available_from || null;
  if (b.available_until !== undefined) patch.available_until = b.available_until || null;
  if (b.max_quantity !== undefined) patch.max_quantity = b.max_quantity === null ? null : Number(b.max_quantity) || null;

  for (const k of ["price_usd_cents", "price_brl_cents"] as const) {
    if (b[k] !== undefined) {
      const c = b[k];
      if (typeof c === "number" && Number.isInteger(c) && c >= 0 && c <= 100_000_00) patch[k] = c;
      else return NextResponse.json({ error: `invalid ${k}` }, { status: 400 });
    }
  }
  if (b.price_pixels !== undefined) {
    if (b.price_pixels === null) patch.price_pixels = null;
    else if (typeof b.price_pixels === "number" && Number.isInteger(b.price_pixels) && b.price_pixels >= 0 && b.price_pixels <= 10_000_000) patch.price_pixels = b.price_pixels;
    else return NextResponse.json({ error: "invalid price_pixels" }, { status: 400 });
  }

  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "nothing to update" }, { status: 400 });

  const admin = getSupabaseAdmin();
  const { error } = await admin.from("items").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id, ...patch });
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { error: authErr } = await requireAdmin();
  if (authErr) return authErr;
  const { id } = await ctx.params;
  const admin = getSupabaseAdmin();
  // Soft retire: never hard-delete a cosmetic (owners keep purchases). Just
  // pull it from sale — the Fortnite "vaulting" model.
  const { error } = await admin.from("items").update({ is_active: false }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id, vaulted: true });
}
