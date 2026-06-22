import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  EMBLEM_TIERS,
  requireAdmin,
  parseCriteria,
  parseMilestones,
} from "@/lib/emblems-admin";

// Update any catalog field (including the active draft→live flag). Partial: only
// the keys present in the body are changed.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;
  let b: Record<string, unknown>;
  try {
    b = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if ("name" in b) update.name = String(b.name ?? "").slice(0, 120);
  if ("description" in b) update.description = String(b.description ?? "").slice(0, 600);
  if ("family" in b) update.family = (String(b.family ?? "").trim() || "misc").slice(0, 40);
  if ("tier" in b) update.tier = (EMBLEM_TIERS as readonly string[]).includes(String(b.tier)) ? String(b.tier) : "bronze";
  if ("glyph" in b) update.glyph = String(b.glyph ?? "").trim() || "sparkle";
  if ("is_counter" in b) update.is_counter = Boolean(b.is_counter);
  if ("active" in b) update.active = Boolean(b.active);
  if ("xp_reward" in b) update.xp_reward = Number.isFinite(Number(b.xp_reward)) ? Math.max(0, Math.floor(Number(b.xp_reward))) : 0;
  if ("sort_order" in b) update.sort_order = Number.isFinite(Number(b.sort_order)) ? Math.floor(Number(b.sort_order)) : 0;
  if ("unlock_item_id" in b) update.unlock_item_id = b.unlock_item_id ? String(b.unlock_item_id) : null;
  if ("criteria" in b) {
    const crit = parseCriteria(b.criteria);
    if (!crit.ok) return NextResponse.json({ error: crit.msg }, { status: 400 });
    update.criteria = crit.value;
  }
  if ("milestones" in b) {
    const ms = parseMilestones(b.milestones);
    if (!ms.ok) return NextResponse.json({ error: ms.msg }, { status: 400 });
    update.milestones = ms.value;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin.from("emblems").update(update).eq("id", id).select().maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Emblem not found" }, { status: 404 });
  return NextResponse.json({ ok: true, emblem: data });
}

// Delete an emblem — only when nobody holds it. If it has holders, deactivate it
// instead (active=false) so earned history is never destroyed.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;
  const admin = getSupabaseAdmin();

  const { count, error: cntErr } = await admin
    .from("emblem_grants")
    .select("emblem_id", { count: "exact", head: true })
    .eq("emblem_id", id);
  if (cntErr) return NextResponse.json({ error: cntErr.message }, { status: 500 });
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: `${count} developer(s) hold this emblem — deactivate it instead of deleting.` },
      { status: 409 },
    );
  }

  // No holders: clean any stray ledger rows (no cascade on the ledger FK), then delete.
  await admin.from("emblem_grant_events").delete().eq("emblem_id", id);
  const { error } = await admin.from("emblems").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
