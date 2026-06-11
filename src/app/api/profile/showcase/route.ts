import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  MAX_FEATURED,
  buildTitlePool,
  type ProfileShowcaseConfig,
  type ShowcaseAchievement,
} from "@/lib/profile-showcase";

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const githubLogin = (
    user.user_metadata.user_name ??
    user.user_metadata.preferred_username ??
    ""
  ).toLowerCase();

  const { data: dev } = await admin
    .from("developers")
    .select("id, claimed, claimed_by, xp_level")
    .eq("github_login", githubLogin)
    .single();

  if (!dev || !dev.claimed || dev.claimed_by !== user.id) {
    return NextResponse.json({ error: "Must own a claimed building" }, { status: 403 });
  }

  const body = (await request.json()) as {
    featured_achievements?: unknown;
    equipped_title?: unknown;
  };

  const hasFeatured = "featured_achievements" in body;
  const hasTitle = "equipped_title" in body;
  if (!hasFeatured && !hasTitle) {
    return NextResponse.json({ error: "Nothing to save" }, { status: 400 });
  }

  // Unlocked achievements — validates featured ids and feeds the title pool
  const { data: unlockedRows } = await admin
    .from("developer_achievements")
    .select("achievement_id, unlocked_at, achievements(name, tier, description)")
    .eq("developer_id", dev.id);
  const achievements: ShowcaseAchievement[] = (unlockedRows ?? []).map(
    (row: Record<string, unknown>) => {
      const meta = row.achievements as Record<string, unknown> | null;
      return {
        achievement_id: row.achievement_id as string,
        name: (meta?.name as string) ?? (row.achievement_id as string),
        tier: (meta?.tier as string) ?? "bronze",
        description: (meta?.description as string) ?? null,
        unlocked_at: (row.unlocked_at as string) ?? null,
      };
    }
  );

  const update: ProfileShowcaseConfig = {};

  if (hasFeatured) {
    const featured = body.featured_achievements;
    if (
      !Array.isArray(featured) ||
      featured.some((id) => typeof id !== "string")
    ) {
      return NextResponse.json(
        { error: "featured_achievements must be an array of achievement ids" },
        { status: 400 }
      );
    }
    if (featured.length > MAX_FEATURED) {
      return NextResponse.json(
        { error: `At most ${MAX_FEATURED} featured achievements` },
        { status: 400 }
      );
    }
    const owned = new Set(achievements.map((a) => a.achievement_id));
    const notOwned = (featured as string[]).find((id) => !owned.has(id));
    if (notOwned) {
      return NextResponse.json(
        { error: `You haven't unlocked ${notOwned}` },
        { status: 403 }
      );
    }
    update.featured_achievements = [...new Set(featured as string[])];
  }

  if (hasTitle) {
    const title = body.equipped_title;
    if (title !== null && typeof title !== "string") {
      return NextResponse.json(
        { error: "equipped_title must be a string or null" },
        { status: 400 }
      );
    }
    if (typeof title === "string") {
      const pool = buildTitlePool(dev.xp_level ?? 1, achievements);
      if (!pool.includes(title)) {
        return NextResponse.json(
          { error: `${title} is not an unlocked title` },
          { status: 403 }
        );
      }
    }
    update.equipped_title = title as string | null;
  }

  // Merge with the existing "profile" config — separate row from "loadout",
  // so loadout saves and showcase saves never touch each other.
  const { data: existing } = await admin
    .from("developer_customizations")
    .select("config")
    .eq("developer_id", dev.id)
    .eq("item_id", "profile")
    .maybeSingle();
  const config: ProfileShowcaseConfig = {
    ...((existing?.config ?? {}) as ProfileShowcaseConfig),
    ...update,
  };

  const { error: saveErr } = await admin.from("developer_customizations").upsert(
    {
      developer_id: dev.id,
      item_id: "profile",
      config,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "developer_id,item_id" }
  );
  if (saveErr) {
    return NextResponse.json(
      { error: `Couldn't save showcase: ${saveErr.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, profile: config });
}
