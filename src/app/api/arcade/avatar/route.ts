import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";

// Hex color validation
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
function isValidHex(v: unknown): v is string {
  return typeof v === "string" && HEX_RE.test(v);
}

// Default loadout for new players (all free items)
const DEFAULT_LOADOUT: Record<string, string | null> = {
  skin_color: "#e8c4a0",
  hair_id: "buzzcut",
  hair_color: "#1a1a1a",
  clothes_top_id: "basic",
  clothes_top_color: "#4a9eff",
  clothes_bottom_id: "pants",
  clothes_bottom_color: "#2c3e50",
  clothes_full_id: null,
  clothes_full_color: null,
  shoes_id: "shoes",
  shoes_color: "#4a3728",
  eyes_color: "#4a3728",
  acc_hat_id: null,
  acc_face_id: null,
  acc_facial_id: null,
  acc_jewelry_id: null,
  blush_id: null,
  lipstick_id: null,
  pet_id: null,
};

// Map old sprite_id (0-5) to a loadout so existing players get a cozy avatar
const LEGACY_SPRITE_MAP: Record<number, Record<string, string | null>> = {
  0: { skin_color: "#e8c4a0", hair_id: "buzzcut", hair_color: "#2c1810", clothes_top_id: "basic", clothes_top_color: "#4a9eff" },
  1: { skin_color: "#c4956a", hair_id: "curly", hair_color: "#8B4513", clothes_full_id: "overalls", clothes_full_color: "#e74c3c", clothes_top_id: null, clothes_bottom_id: null },
  2: { skin_color: "#e8c4a0", hair_id: "ponytail", hair_color: "#FFD700", clothes_top_id: "stripe", clothes_top_color: "#9b59b6" },
  3: { skin_color: "#6b4226", hair_id: "gentleman", hair_color: "#1a1a1a", clothes_full_id: "suit", clothes_full_color: "#2c3e50", clothes_top_id: null, clothes_bottom_id: null },
  4: { skin_color: "#a0714f", hair_id: "emo", hair_color: "#4169E1", clothes_full_id: "sporty", clothes_full_color: "#c8e64a", clothes_top_id: null, clothes_bottom_id: null },
  5: { skin_color: "#e8c4a0", hair_id: "bob", hair_color: "#B22222", clothes_full_id: "dress", clothes_full_color: "#e91e63", clothes_top_id: null, clothes_bottom_id: null },
};

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();

  // Get developer_id
  const { data: dev } = await admin
    .from("developers")
    .select("id")
    .eq("claimed_by", user.id)
    .single();

  if (!dev) {
    return NextResponse.json({ error: "Developer not found" }, { status: 404 });
  }

  // Try new loadout first
  const { data: loadout } = await admin
    .from("arcade_avatar_loadouts")
    .select("*")
    .eq("developer_id", dev.id)
    .maybeSingle();

  if (loadout) {
    return NextResponse.json({ loadout }, {
      headers: { "Cache-Control": "private, max-age=30" },
    });
  }

  // Fallback: check old arcade_avatars and migrate
  const { data: oldAvatar } = await admin
    .from("arcade_avatars")
    .select("config")
    .eq("user_id", user.id)
    .maybeSingle();

  if (oldAvatar?.config) {
    const spriteId = Number(oldAvatar.config.sprite_id ?? 0);
    const mapped = LEGACY_SPRITE_MAP[spriteId] ?? LEGACY_SPRITE_MAP[0];
    const newLoadout = { ...DEFAULT_LOADOUT, ...mapped };

    // Auto-migrate: create new loadout
    await admin.from("arcade_avatar_loadouts").upsert({
      developer_id: dev.id,
      ...newLoadout,
      updated_at: new Date().toISOString(),
    }, { onConflict: "developer_id" });

    // Grant free items if not already
    const { data: freeItems } = await admin
      .from("arcade_shop_items")
      .select("id")
      .eq("rarity", "free");

    if (freeItems) {
      await admin.from("arcade_inventory").upsert(
        freeItems.map((item) => ({ developer_id: dev.id, item_id: item.id })),
        { onConflict: "developer_id,item_id", ignoreDuplicates: true },
      );
    }

    return NextResponse.json({ loadout: { developer_id: dev.id, ...newLoadout } }, {
      headers: { "Cache-Control": "private, max-age=30" },
    });
  }

  // No avatar at all — return default (UI will show avatar editor)
  return NextResponse.json({ loadout: null }, {
    headers: { "Cache-Control": "private, max-age=30" },
  });
}

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  const { data: dev } = await admin
    .from("developers")
    .select("id")
    .eq("claimed_by", user.id)
    .single();

  if (!dev) {
    return NextResponse.json({ error: "Developer not found" }, { status: 404 });
  }

  // Backwards compat: if old-style { sprite_id } is sent, map it
  if ("sprite_id" in body && Object.keys(body).length === 1) {
    const spriteId = Number(body.sprite_id ?? 0);
    const mapped = LEGACY_SPRITE_MAP[spriteId] ?? LEGACY_SPRITE_MAP[0];
    const newLoadout = { ...DEFAULT_LOADOUT, ...mapped };

    // Save to old table too for backwards compat
    await admin.from("arcade_avatars").upsert({
      user_id: user.id,
      config: { sprite_id: spriteId },
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

    // Save to new table
    await admin.from("arcade_avatar_loadouts").upsert({
      developer_id: dev.id,
      ...newLoadout,
      updated_at: new Date().toISOString(),
    }, { onConflict: "developer_id" });

    return NextResponse.json({ loadout: { developer_id: dev.id, ...newLoadout } });
  }

  // New-style loadout update — validate that player owns all equipped items
  const slotFields = [
    "hair_id", "clothes_top_id", "clothes_bottom_id", "clothes_full_id",
    "shoes_id", "acc_hat_id", "acc_face_id", "acc_facial_id", "acc_jewelry_id",
    "blush_id", "lipstick_id", "pet_id",
  ] as const;

  const equippedIds = slotFields
    .map((f) => body[f])
    .filter((v): v is string => typeof v === "string" && v !== "");

  if (equippedIds.length > 0) {
    // Check ownership (free items + purchased items)
    const { data: owned } = await admin
      .from("arcade_inventory")
      .select("item_id")
      .eq("developer_id", dev.id)
      .in("item_id", equippedIds);

    const ownedSet = new Set((owned ?? []).map((r) => r.item_id));
    const notOwned = equippedIds.filter((id) => !ownedSet.has(id));

    if (notOwned.length > 0) {
      return NextResponse.json(
        { error: "Items not owned", items: notOwned },
        { status: 403 },
      );
    }
  }

  // Build loadout row — only accept known fields
  const colorFields = new Set([
    "skin_color", "eyes_color", "hair_color",
    "clothes_top_color", "clothes_bottom_color", "clothes_full_color",
    "shoes_color", "acc_hat_color", "acc_face_color",
    "acc_facial_color", "acc_jewelry_color", "blush_color", "lipstick_color",
  ]);

  const idFields = new Set([
    "hair_id", "clothes_top_id", "clothes_bottom_id", "clothes_full_id",
    "shoes_id", "acc_hat_id", "acc_face_id", "acc_facial_id", "acc_jewelry_id",
    "blush_id", "lipstick_id", "pet_id",
  ]);

  const loadoutData: Record<string, unknown> = {
    developer_id: dev.id,
    updated_at: new Date().toISOString(),
  };

  for (const field of [...colorFields]) {
    if (field in body) {
      const val = body[field];
      if (val === null) {
        loadoutData[field] = null;
      } else if (isValidHex(val)) {
        loadoutData[field] = val;
      } else {
        return NextResponse.json({ error: `Invalid color for ${field}` }, { status: 400 });
      }
    }
  }

  for (const field of [...idFields]) {
    if (field in body) {
      const val = body[field];
      if (val === null || val === "") {
        loadoutData[field] = null;
      } else if (typeof val === "string" && val.length <= 50) {
        loadoutData[field] = val;
      } else {
        return NextResponse.json({ error: `Invalid value for ${field}` }, { status: 400 });
      }
    }
  }

  const { error } = await admin
    .from("arcade_avatar_loadouts")
    .upsert(loadoutData, { onConflict: "developer_id" });

  if (error) {
    console.error("Loadout upsert error:", error);
    return NextResponse.json({ error: "Failed to save loadout" }, { status: 500 });
  }

  // Return full loadout
  const { data: saved } = await admin
    .from("arcade_avatar_loadouts")
    .select("*")
    .eq("developer_id", dev.id)
    .single();

  return NextResponse.json({ loadout: saved });
}
