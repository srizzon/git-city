import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { EMBLEM_GLYPHS } from "@/components/profile/emblem-glyphs";
import {
  EMBLEM_TIERS,
  EMBLEM_METRICS,
  EMBLEM_ID_RE,
  requireAdmin,
  parseCriteria,
  parseMilestones,
} from "@/lib/emblems-admin";

// Full emblem catalog + distribution stats for the admin panel. Managing the
// honors layer is data-only: a new emblem is one row here, no code change.

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const admin = getSupabaseAdmin();
  const [emblemsRes, statsRes, itemsRes] = await Promise.all([
    admin.from("emblems").select("*").order("family").order("sort_order").order("id"),
    admin.from("emblem_stats").select("*"),
    admin.from("items").select("id, name").order("name"),
  ]);
  if (emblemsRes.error) return NextResponse.json({ error: emblemsRes.error.message }, { status: 500 });

  const stats: Record<string, { holders: number; total_grants: number }> = {};
  for (const s of statsRes.data ?? []) {
    stats[s.emblem_id] = { holders: Number(s.holders), total_grants: Number(s.total_grants) };
  }

  return NextResponse.json({
    emblems: emblemsRes.data ?? [],
    stats,
    meta: {
      glyphs: Object.keys(EMBLEM_GLYPHS),
      metrics: EMBLEM_METRICS,
      tiers: EMBLEM_TIERS,
      items: itemsRes.data ?? [],
    },
  });
}

// Create an emblem. Defaults to draft (active=false) so it never reaches players
// until you flip it live.
export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let b: Record<string, unknown>;
  try {
    b = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const id = String(b.id ?? "").trim();
  if (!EMBLEM_ID_RE.test(id)) {
    return NextResponse.json({ error: "id must be lowercase a-z 0-9 _ (2-48 chars)" }, { status: 400 });
  }

  const crit = parseCriteria(b.criteria);
  if (!crit.ok) return NextResponse.json({ error: crit.msg }, { status: 400 });
  const ms = parseMilestones(b.milestones);
  if (!ms.ok) return NextResponse.json({ error: ms.msg }, { status: 400 });

  const row = {
    id,
    name: String(b.name ?? id).slice(0, 120),
    description: String(b.description ?? "").slice(0, 600),
    family: (String(b.family ?? "").trim() || "misc").slice(0, 40),
    tier: (EMBLEM_TIERS as readonly string[]).includes(String(b.tier)) ? String(b.tier) : "bronze",
    glyph: String(b.glyph ?? "").trim() || "sparkle",
    is_counter: Boolean(b.is_counter),
    milestones: ms.value,
    criteria: crit.value,
    xp_reward: Number.isFinite(Number(b.xp_reward)) ? Math.max(0, Math.floor(Number(b.xp_reward))) : 0,
    unlock_item_id: b.unlock_item_id ? String(b.unlock_item_id) : null,
    active: Boolean(b.active),
    sort_order: Number.isFinite(Number(b.sort_order)) ? Math.floor(Number(b.sort_order)) : 0,
  };

  const admin = getSupabaseAdmin();
  const { error } = await admin.from("emblems").insert(row);
  if (error) {
    const msg = error.code === "23505" ? `An emblem with id "${id}" already exists` : error.message;
    return NextResponse.json({ error: msg }, { status: error.code === "23505" ? 409 : 500 });
  }
  return NextResponse.json({ ok: true, emblem: row });
}
