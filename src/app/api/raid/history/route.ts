import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const developerId = searchParams.get("developer_id");
  const limit = Math.min(50, parseInt(searchParams.get("limit") ?? "20", 10));
  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10));

  if (!developerId) {
    return NextResponse.json({ error: "Missing developer_id" }, { status: 400 });
  }

  const devId = parseInt(developerId, 10);
  if (isNaN(devId)) {
    return NextResponse.json({ error: "Invalid developer_id" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  // Fetch raids involving this developer (attacker or defender)
  const [raidsAttacker, raidsDefender, activeTagRes, totalAttacker, totalDefender] = await Promise.all([
    admin
      .from("raids")
      .select("id, attacker_id, defender_id, success, created_at, attacker:developers!raids_attacker_id_fkey(github_login), defender:developers!raids_defender_id_fkey(github_login)")
      .eq("attacker_id", devId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1),
    admin
      .from("raids")
      .select("id, attacker_id, defender_id, success, created_at, attacker:developers!raids_attacker_id_fkey(github_login), defender:developers!raids_defender_id_fkey(github_login)")
      .eq("defender_id", devId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1),
    admin
      .from("raid_tags")
      .select("attacker_login, tag_style, expires_at")
      .eq("building_id", devId)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("raids")
      .select("id", { count: "exact", head: true })
      .eq("attacker_id", devId),
    admin
      .from("raids")
      .select("id", { count: "exact", head: true })
      .eq("defender_id", devId),
  ]);

  // Merge and sort
  const allRaids = [
    ...(raidsAttacker.data ?? []),
    ...(raidsDefender.data ?? []),
  ]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit)
    .map((r) => ({
      id: r.id,
      attacker_login: (r.attacker as unknown as { github_login: string })?.github_login ?? "unknown",
      defender_login: (r.defender as unknown as { github_login: string })?.github_login ?? "unknown",
      success: r.success,
      created_at: r.created_at,
    }));

  return NextResponse.json({
    raids: allRaids,
    total: (totalAttacker.count ?? 0) + (totalDefender.count ?? 0),
    active_tag: activeTagRes.data ?? null,
  }, {
    headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
  });
}
