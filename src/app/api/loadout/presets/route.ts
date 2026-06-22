import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";

// Named full-building loadouts (Fortnite "Loadouts" / Roblox outfits): save a
// whole look and re-apply it in one click. Stored in developer_customizations
// under item_id="loadout_presets" so no schema change is needed. Applying a
// preset still routes through POST /api/loadout, which validates ownership —
// these rows are just saved combos, not a trust boundary.

const MAX_PRESETS = 24;

export interface LoadoutPreset {
  name: string;
  crown: string | null;
  roof: string | null;
  aura: string | null;
}

async function ownerDev(): Promise<{ id: number } | null> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const login = (user.user_metadata?.user_name ?? user.user_metadata?.preferred_username ?? "").toLowerCase();
  if (!login) return null;
  const admin = getSupabaseAdmin();
  const { data: dev } = await admin.from("developers").select("id, claimed, claimed_by").eq("github_login", login).single();
  if (!dev || !dev.claimed || dev.claimed_by !== user.id) return null;
  return { id: dev.id };
}

export async function GET() {
  const dev = await ownerDev();
  if (!dev) return NextResponse.json({ presets: [] });
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("developer_customizations")
    .select("config")
    .eq("developer_id", dev.id)
    .eq("item_id", "loadout_presets")
    .maybeSingle();
  const presets = (data?.config as { presets?: LoadoutPreset[] } | null)?.presets ?? [];
  return NextResponse.json({ presets });
}

export async function POST(request: Request) {
  const dev = await ownerDev();
  if (!dev) return NextResponse.json({ error: "Must own a claimed building" }, { status: 403 });

  let body: { presets?: LoadoutPreset[] };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }

  const presets = (body.presets ?? [])
    .slice(0, MAX_PRESETS)
    .map((p) => ({
      name: String(p.name ?? "").slice(0, 40),
      crown: p.crown ?? null,
      roof: p.roof ?? null,
      aura: p.aura ?? null,
    }))
    .filter((p) => p.name.length > 0);

  const admin = getSupabaseAdmin();
  const { error: saveErr } = await admin.from("developer_customizations").upsert(
    { developer_id: dev.id, item_id: "loadout_presets", config: { presets }, updated_at: new Date().toISOString() },
    { onConflict: "developer_id,item_id" }
  );
  if (saveErr) {
    return NextResponse.json({ error: `Couldn't save looks: ${saveErr.message}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true, presets });
}
