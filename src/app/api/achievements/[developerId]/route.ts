import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ developerId: string }> }
) {
  const { developerId: devIdStr } = await params;
  const developerId = parseInt(devIdStr, 10);
  if (isNaN(developerId)) {
    return NextResponse.json({ error: "Invalid developer ID" }, { status: 400 });
  }

  const sb = getSupabaseAdmin();

  const [allRes, unlockedRes] = await Promise.all([
    // The legacy achievement set (the unified emblem catalog minus event emblems),
    // shaped back to the old achievement fields so the client is unchanged.
    sb
      .from("emblems")
      .select("id, category:family, name, description, tier, sort_order, reward_item_id:unlock_item_id, criteria")
      .neq("family", "events")
      .order("sort_order"),
    sb
      .from("emblem_grants")
      .select("achievement_id:emblem_id, unlocked_at:first_earned_at, seen")
      .eq("developer_id", developerId),
  ]);

  const unlockedMap = new Map(
    (unlockedRes.data ?? []).map((r) => [r.achievement_id, r])
  );

  const achievements = (allRes.data ?? []).map((a) => {
    const { criteria, ...rest } = a as Record<string, unknown>;
    const id = rest.id as string;
    return {
      ...rest,
      threshold: (criteria as { gte?: number } | null)?.gte ?? null,
      unlocked: unlockedMap.has(id),
      unlocked_at: unlockedMap.get(id)?.unlocked_at ?? null,
      seen: unlockedMap.get(id)?.seen ?? false,
    };
  });

  return NextResponse.json(
    { achievements },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } }
  );
}
