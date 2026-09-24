import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { buildDropsArray, CITY_DEV_COLUMNS, loadCityExtras, mergeCityExtras } from "@/lib/city-extras";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = Math.max(0, parseInt(searchParams.get("from") ?? "0", 10));
  const to = Math.min(
    from + 1000,
    parseInt(searchParams.get("to") ?? "500", 10)
  );

  const sb = getSupabaseAdmin();

  // Round 1: devs + stats in parallel
  const [devsResult, statsResult] = await Promise.all([
    sb
      .from("developers")
      .select(CITY_DEV_COLUMNS)
      .order("rank", { ascending: true })
      .range(from, to - 1),
    sb.from("city_stats").select("*").eq("id", 1).single(),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const devs = (devsResult.data ?? []) as Record<string, any>[];
  const devIds = devs.map((d) => d.id);

  if (devIds.length === 0) {
    return NextResponse.json(
      {
        developers: [],
        stats: statsResult.data ?? { total_developers: 0, total_contributions: 0 },
      },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }
    );
  }

  // Round 2: extras (purchases, customizations, emblems, raid tags, wallets,
  // league crowns) + active drops in parallel
  const [extras, activeDropsResult] = await Promise.all([
    loadCityExtras(sb, devIds),
    sb
      .from("building_drops")
      .select("id, building_id, rarity, points, max_pulls, pull_count, expires_at")
      .gt("expires_at", new Date().toISOString()),
  ]);

  const _d = buildDropsArray(devs as { id: number; rank: number }[], activeDropsResult.data ?? []);
  const developersWithItems = mergeCityExtras(devs as { id: number }[], extras);

  return NextResponse.json(
    {
      developers: developersWithItems,
      _d,
      stats: statsResult.data ?? {
        total_developers: 0,
        total_contributions: 0,
      },
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    }
  );
}
