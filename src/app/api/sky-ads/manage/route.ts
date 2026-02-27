import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";

const OWNER_LOGIN = "srizzon";

async function checkAdmin() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const login = (
    user.user_metadata.user_name ??
    user.user_metadata.preferred_username ??
    ""
  ).toLowerCase();
  return login === OWNER_LOGIN ? user : null;
}

// Create a new ad
export async function POST(request: Request) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { id, brand, text, description, color, bg_color, link, vehicle, priority, starts_at, ends_at } = body;

  if (!id || !brand || !text) {
    return NextResponse.json({ error: "Missing required fields: id, brand, text" }, { status: 400 });
  }

  const validVehicles = ["plane", "blimp", "billboard", "rooftop_sign", "led_wrap"];
  const safeVehicle = validVehicles.includes(vehicle) ? vehicle : "plane";

  const admin = getSupabaseAdmin();
  const { data, error } = await admin.from("sky_ads").insert({
    id,
    brand,
    text,
    description: description ?? null,
    color: color ?? "#f8d880",
    bg_color: bg_color ?? "#1a1018",
    link: link ?? null,
    vehicle: safeVehicle,
    priority: priority ?? 50,
    starts_at: starts_at ?? null,
    ends_at: ends_at ?? null,
  }).select().single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data, { status: 201 });
}

// Update an existing ad
const ALLOWED_UPDATE_FIELDS = new Set([
  "active", "brand", "text", "description", "color", "bg_color",
  "link", "vehicle", "priority", "starts_at", "ends_at",
]);

export async function PUT(request: Request) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { id, ...raw } = body;

  if (!id) {
    return NextResponse.json({ error: "Missing ad id" }, { status: 400 });
  }

  // Only allow whitelisted fields
  const updates: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (ALLOWED_UPDATE_FIELDS.has(k)) updates[k] = v;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("sky_ads")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}

// Hard delete ad row
export async function DELETE(request: Request) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing ad id" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  // Delete related events first, then the ad
  await admin.from("sky_ad_events").delete().eq("ad_id", id);
  const { error } = await admin.from("sky_ads").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

// Batch operations: pause, resume, or delete multiple ads
export async function PATCH(request: Request) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { ids, action } = body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "Missing ids array" }, { status: 400 });
  }

  const validActions = ["pause", "resume", "delete"];
  if (!validActions.includes(action)) {
    return NextResponse.json({ error: "Invalid action. Use: pause, resume, delete" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  if (action === "delete") {
    // Delete related events first, then the ads
    await admin.from("sky_ad_events").delete().in("ad_id", ids);
    const { error } = await admin.from("sky_ads").delete().in("id", ids);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  } else {
    const active = action === "resume";
    const { error } = await admin
      .from("sky_ads")
      .update({ active })
      .in("id", ids);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true, affected: ids.length });
}
