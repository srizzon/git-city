import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { RAID_VEHICLE_ITEMS, RAID_TAG_ITEMS } from "@/lib/zones";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const devId = searchParams.get("developer_id");

  const admin = getSupabaseAdmin();

  // Support both developer_id param and auth-based lookup
  let developerId: number | null = null;

  if (devId) {
    developerId = parseInt(devId, 10);
  } else {
    // Auth-based: resolve developer_id from session
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const githubLogin = (
      user.user_metadata.user_name ??
      user.user_metadata.preferred_username ??
      ""
    ).toLowerCase();
    const { data: dev } = await admin
      .from("developers")
      .select("id")
      .eq("github_login", githubLogin)
      .single();
    if (dev) developerId = dev.id;
  }

  if (!developerId) {
    return NextResponse.json({ vehicle: "airplane", tag: "default" });
  }

  const { data } = await admin
    .from("developer_customizations")
    .select("config")
    .eq("developer_id", developerId)
    .eq("item_id", "raid_loadout")
    .maybeSingle();

  const config = (data?.config as { vehicle?: string; tag?: string }) ?? {};

  return NextResponse.json({
    vehicle: config.vehicle ?? "airplane",
    tag: config.tag ?? "default",
  }, {
    headers: { "Cache-Control": "private, max-age=30" },
  });
}

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
    .select("id, claimed, claimed_by")
    .eq("github_login", githubLogin)
    .single();

  if (!dev || !dev.claimed || dev.claimed_by !== user.id) {
    return NextResponse.json({ error: "Must own a claimed building" }, { status: 403 });
  }

  const body = await request.json();
  const { vehicle, tag } = body as { vehicle?: string; tag?: string };

  // Fetch owned items for validation
  const { data: purchases } = await admin
    .from("purchases")
    .select("item_id, items!inner(metadata)")
    .eq("developer_id", dev.id)
    .eq("status", "completed");

  const ownedSet = new Set((purchases ?? []).map((p) => p.item_id));

  // Build config from current + updates
  const { data: currentData } = await admin
    .from("developer_customizations")
    .select("config")
    .eq("developer_id", dev.id)
    .eq("item_id", "raid_loadout")
    .maybeSingle();

  const current = (currentData?.config as { vehicle?: string; tag?: string }) ?? {};
  const config: { vehicle: string; tag: string } = {
    vehicle: current.vehicle ?? "airplane",
    tag: current.tag ?? "default",
  };

  // Validate vehicle
  if (vehicle !== undefined) {
    if (vehicle === "airplane") {
      config.vehicle = "airplane";
    } else if (RAID_VEHICLE_ITEMS.includes(vehicle) && ownedSet.has(vehicle)) {
      config.vehicle = vehicle;
    } else {
      return NextResponse.json({ error: "Vehicle not owned or invalid" }, { status: 403 });
    }
  }

  // Validate tag
  if (tag !== undefined) {
    if (tag === "default") {
      config.tag = "default";
    } else if (RAID_TAG_ITEMS.includes(tag) && ownedSet.has(tag)) {
      config.tag = tag;
    } else {
      return NextResponse.json({ error: "Tag not owned or invalid" }, { status: 403 });
    }
  }

  // Upsert
  await admin.from("developer_customizations").upsert(
    {
      developer_id: dev.id,
      item_id: "raid_loadout",
      config,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "developer_id,item_id" }
  );

  return NextResponse.json({ ok: true, vehicle: config.vehicle, tag: config.tag });
}
