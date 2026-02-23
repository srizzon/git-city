import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const developerId = parseInt(searchParams.get("developer_id") ?? "", 10);

  if (!developerId || isNaN(developerId)) {
    return NextResponse.json(
      { error: "developer_id is required" },
      { status: 400 }
    );
  }

  const sb = getSupabaseAdmin();

  const { data } = await sb
    .from("developer_customizations")
    .select("item_id, config")
    .eq("developer_id", developerId)
    .in("item_id", ["custom_color", "billboard"]);

  let customColor: string | null = null;
  let billboardImages: string[] = [];

  for (const row of data ?? []) {
    const config = row.config as Record<string, unknown>;
    if (row.item_id === "custom_color" && typeof config?.color === "string") {
      customColor = config.color;
    }
    if (row.item_id === "billboard") {
      // Support both new array format and legacy single image
      if (Array.isArray(config?.images)) {
        billboardImages = config.images as string[];
      } else if (typeof config?.image_url === "string") {
        billboardImages = [config.image_url];
      }
    }
  }

  return NextResponse.json({
    custom_color: customColor,
    billboard_images: billboardImages,
  });
}

export async function POST(request: Request) {
  // Auth required
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const githubLogin = (
    user.user_metadata?.user_name ??
    user.user_metadata?.preferred_username ??
    ""
  ).toLowerCase();

  if (!githubLogin) {
    return NextResponse.json(
      { error: "No GitHub login found" },
      { status: 400 }
    );
  }

  const sb = getSupabaseAdmin();

  // Validate developer
  const { data: dev } = await sb
    .from("developers")
    .select("id, claimed, claimed_by")
    .eq("github_login", githubLogin)
    .single();

  if (!dev || !dev.claimed || dev.claimed_by !== user.id) {
    return NextResponse.json(
      { error: "Building not found or not yours" },
      { status: 403 }
    );
  }

  // Parse body
  let body: { item_id: string; color?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { item_id, color } = body;

  if (item_id !== "custom_color") {
    return NextResponse.json(
      { error: "Use /api/customizations/upload for billboard" },
      { status: 400 }
    );
  }

  // Validate ownership
  const { data: purchase } = await sb
    .from("purchases")
    .select("id")
    .eq("developer_id", dev.id)
    .eq("item_id", "custom_color")
    .eq("status", "completed")
    .maybeSingle();

  if (!purchase) {
    return NextResponse.json(
      { error: "You don't own this item" },
      { status: 403 }
    );
  }

  // null = remove color, otherwise validate hex
  if (color !== null && color !== undefined) {
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
      return NextResponse.json(
        { error: "Invalid hex color (use #RRGGBB)" },
        { status: 400 }
      );
    }
  }

  if (color === null) {
    // Remove customization
    const { error: deleteError } = await sb
      .from("developer_customizations")
      .delete()
      .eq("developer_id", dev.id)
      .eq("item_id", "custom_color");

    if (deleteError) {
      console.error("Delete error:", deleteError);
      return NextResponse.json(
        { error: "Failed to remove customization" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, color: null });
  }

  // Upsert customization
  const { error: upsertError } = await sb
    .from("developer_customizations")
    .upsert(
      {
        developer_id: dev.id,
        item_id: "custom_color",
        config: { color },
      },
      { onConflict: "developer_id,item_id" }
    );

  if (upsertError) {
    console.error("Upsert error:", upsertError);
    return NextResponse.json(
      { error: "Failed to save customization" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, color });
}
