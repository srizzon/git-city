import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getGithubLoginFromUser, isAdminGithubLogin } from "@/lib/admin";
import { parseRewardsConfig, parseThemeConfig, parseBossConfig } from "@/lib/events/schema";

// Admin actions on a single event:
//   PATCH { action: "start" | "end" | "cancel" }            lifecycle
//   PATCH { action: "update", ... }                         live config editor (no deploy)
//   PATCH { action: "extend", ends_at }                     change end time
//   PATCH { action: "release" }                             grant held rewards
//   DELETE → remove a scheduled/archived event

async function requireAdmin() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const login = getGithubLoginFromUser(user);
  if (!isAdminGithubLogin(login)) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { login };
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const action = body.action;
  const admin = getSupabaseAdmin();
  const audit = (act: string, detail?: Record<string, unknown>) =>
    admin.from("event_audit_log").insert({ event_id: id, actor: auth.login ?? "unknown", action: act, detail: detail ?? {} });

  if (action === "start") {
    const { error } = await admin
      .from("event_instances")
      .update({ status: "live", starts_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await audit("start");
    return NextResponse.json({ ok: true, status: "live" });
  }

  if (action === "end") {
    // Move to wrap; complete_event_wrap computes totals/outcome/ranks. It then
    // either distributes (auto) or holds for manual release (auto_distribute=false).
    await admin
      .from("event_instances")
      .update({ status: "wrap", ends_at: new Date().toISOString() })
      .eq("id", id);
    const { data, error } = await admin.rpc("complete_event_wrap", { p_event_id: id });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await audit("end");
    return NextResponse.json({ ok: true, result: data });
  }

  if (action === "release") {
    const { data, error } = await admin.rpc("release_event_rewards", { p_event_id: id });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await audit("release");
    return NextResponse.json({ ok: true, result: data });
  }

  if (action === "extend") {
    const endsAt = typeof body.ends_at === "string" ? new Date(body.ends_at) : null;
    if (!endsAt || isNaN(endsAt.getTime())) return NextResponse.json({ error: "invalid ends_at" }, { status: 400 });
    const { error } = await admin.from("event_instances").update({ ends_at: endsAt.toISOString() }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await audit("extend", { ends_at: endsAt.toISOString() });
    return NextResponse.json({ ok: true, ends_at: endsAt.toISOString() });
  }

  if (action === "update") {
    const { data: ev, error: evErr } = await admin
      .from("event_instances")
      .select("id, status, theme_config, boss_config")
      .eq("id", id)
      .single();
    if (evErr || !ev) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (ev.status === "archived") return NextResponse.json({ error: "event is archived (immutable)" }, { status: 400 });

    const patch: Record<string, unknown> = {};
    const changed: string[] = [];

    if (body.rewards !== undefined) {
      // Lock rewards once any grant exists — never repay or rewrite history.
      const { count } = await admin
        .from("event_reward_claims")
        .select("id", { count: "exact", head: true })
        .eq("event_id", id);
      if (count && count > 0)
        return NextResponse.json({ error: "rewards are locked — already distributed" }, { status: 400 });
      const r = parseRewardsConfig(body.rewards);
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
      patch.rewards_config = r.value;
      changed.push("rewards");
    }

    if (body.theme !== undefined) {
      const r = parseThemeConfig(body.theme);
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
      patch.theme_config = { ...(ev.theme_config ?? {}), ...r.value };
      changed.push("theme");
    }

    if (body.boss_config !== undefined) {
      const r = parseBossConfig(body.boss_config);
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
      patch.boss_config = { ...(ev.boss_config ?? {}), ...r.value };
      changed.push("boss_config");
    }

    if (typeof body.auto_distribute === "boolean") {
      patch.auto_distribute = body.auto_distribute;
      changed.push("auto_distribute");
    }

    if (body.sponsor_brand !== undefined) {
      patch.sponsor_brand =
        typeof body.sponsor_brand === "string" && body.sponsor_brand.trim()
          ? body.sponsor_brand.trim().slice(0, 80)
          : null;
      changed.push("sponsor_brand");
    }

    // Start time & total HP only editable while scheduled (DB guard enforces too).
    if (body.boss_max_hp !== undefined) {
      if (ev.status !== "scheduled")
        return NextResponse.json({ error: "boss_max_hp is locked once the event starts" }, { status: 400 });
      const hp = Math.max(5000, Math.min(20_000_000, Number(body.boss_max_hp) || 50000));
      patch.boss_max_hp = hp;
      patch.boss_config = { ...(ev.boss_config ?? {}), ...(patch.boss_config as object ?? {}), base_hp: hp };
      changed.push("boss_max_hp");
    }
    if (body.starts_at !== undefined) {
      if (ev.status !== "scheduled")
        return NextResponse.json({ error: "starts_at is locked once the event starts" }, { status: 400 });
      const s = new Date(body.starts_at as string);
      if (isNaN(s.getTime())) return NextResponse.json({ error: "invalid starts_at" }, { status: 400 });
      patch.starts_at = s.toISOString();
      changed.push("starts_at");
    }

    if (changed.length === 0) return NextResponse.json({ error: "nothing to update" }, { status: 400 });

    const { error } = await admin.from("event_instances").update(patch).eq("id", id);
    if (error) {
      // Surface the state-machine guard's friendly message verbatim.
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    await audit("edit", { changed });
    return NextResponse.json({ ok: true, changed });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { id } = await ctx.params;

  const admin = getSupabaseAdmin();
  // Only allow deleting non-live events
  const { error } = await admin
    .from("event_instances")
    .delete()
    .eq("id", id)
    .neq("status", "live");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
