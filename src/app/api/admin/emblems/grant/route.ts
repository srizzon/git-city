import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/emblems-admin";

// Manual grant / revoke of an emblem to a specific developer — the "distribute"
// channel for gifts, partnerships, and corrections. Grants flow through the same
// idempotent grant_emblem chokepoint (source='admin').

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let b: Record<string, unknown>;
  try {
    b = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const action = String(b.action ?? "grant");
  const emblemId = String(b.emblem_id ?? "").trim();
  if (!emblemId) return NextResponse.json({ error: "emblem_id is required" }, { status: 400 });

  const admin = getSupabaseAdmin();

  // Resolve the target developer by id or github_login.
  let developerId: number | null =
    typeof b.developer_id === "number" ? b.developer_id : null;
  const login = String(b.github_login ?? "").trim().toLowerCase();
  if (developerId === null && login) {
    const { data: dev } = await admin
      .from("developers")
      .select("id")
      .eq("github_login", login)
      .maybeSingle();
    if (!dev) return NextResponse.json({ error: `No developer "${login}"` }, { status: 404 });
    developerId = dev.id as number;
  }
  if (developerId === null) {
    return NextResponse.json({ error: "Provide a developer_id or github_login" }, { status: 400 });
  }

  if (action === "revoke") {
    // Remove every occurrence from the ledger, then rebuild the aggregate cache.
    const { error: delErr } = await admin
      .from("emblem_grant_events")
      .delete()
      .eq("developer_id", developerId)
      .eq("emblem_id", emblemId);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
    const { error: rbErr } = await admin.rpc("rebuild_emblem_grants", { p_developer_id: developerId });
    if (rbErr) return NextResponse.json({ error: rbErr.message }, { status: 500 });
    return NextResponse.json({ ok: true, action: "revoke", developer_id: developerId });
  }

  // Grant (idempotent per dev via the admin claim_key).
  const { data, error } = await admin.rpc("grant_emblem", {
    p_developer_id: developerId,
    p_emblem_id: emblemId,
    p_claim_key: `admin:${emblemId}:${developerId}`,
    p_meta: { by: "admin" },
    p_source: "admin",
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const res = (data ?? {}) as { ok?: boolean; granted?: boolean; duplicate?: boolean; error?: string };
  if (res.ok === false) {
    return NextResponse.json({ error: res.error ?? "Grant failed (unknown or inactive emblem?)" }, { status: 400 });
  }
  return NextResponse.json({
    ok: true,
    action: "grant",
    developer_id: developerId,
    already_had: Boolean(res.duplicate),
  });
}
