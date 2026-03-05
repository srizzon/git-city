import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";

const ITEM_ID = "building_editor_v1";
const TEXT_TOOL_ITEM_ID = "editor_text_tool";
const IMAGE_TOOL_ITEM_ID = "editor_image_tool";

type EditorPayload = Record<string, unknown>;

async function getAuthedDeveloper() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated", status: 401 as const };

  const githubLogin = (
    user.user_metadata?.user_name ??
    user.user_metadata?.preferred_username ??
    ""
  ).toLowerCase();

  if (!githubLogin) return { error: "No GitHub login found", status: 400 as const };

  const sb = getSupabaseAdmin();
  const { data: dev } = await sb
    .from("developers")
    .select("id, github_login, claimed, claimed_by")
    .eq("github_login", githubLogin)
    .single();

  if (!dev || !dev.claimed || dev.claimed_by !== user.id) {
    return { error: "Building not found or not yours", status: 403 as const };
  }

  return { sb, dev, user };
}

export async function GET() {
  const auth = await getAuthedDeveloper();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { sb, dev } = auth;
  const { data } = await sb
    .from("developer_customizations")
    .select("config")
    .eq("developer_id", dev.id)
    .eq("item_id", ITEM_ID)
    .maybeSingle();

  const [ownRes, giftRes] = await Promise.all([
    sb
      .from("purchases")
      .select("item_id")
      .eq("developer_id", dev.id)
      .is("gifted_to", null)
      .eq("status", "completed")
      .in("item_id", [TEXT_TOOL_ITEM_ID, IMAGE_TOOL_ITEM_ID]),
    sb
      .from("purchases")
      .select("item_id")
      .eq("gifted_to", dev.id)
      .eq("status", "completed")
      .in("item_id", [TEXT_TOOL_ITEM_ID, IMAGE_TOOL_ITEM_ID]),
  ]);
  const owned = new Set([...(ownRes.data ?? []), ...(giftRes.data ?? [])].map((p) => p.item_id));

  const config = (data?.config ?? {}) as Record<string, unknown>;
  return NextResponse.json({
    draft: (config.draft ?? null) as EditorPayload | null,
    published: (config.published ?? null) as EditorPayload | null,
    updated_at: config.updated_at ?? null,
    published_at: config.published_at ?? null,
    github_login: dev.github_login,
    features: {
      text_unlocked: owned.has(TEXT_TOOL_ITEM_ID),
      image_unlocked: owned.has(IMAGE_TOOL_ITEM_ID),
    },
  });
}

export async function POST(request: Request) {
  const auth = await getAuthedDeveloper();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { sb, dev } = auth;

  let body: { mode?: "draft" | "publish"; payload?: EditorPayload };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const mode = body.mode;
  const payload = body.payload;
  if ((mode !== "draft" && mode !== "publish") || !payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Invalid mode or payload" }, { status: 400 });
  }

  const { data: existing } = await sb
    .from("developer_customizations")
    .select("config")
    .eq("developer_id", dev.id)
    .eq("item_id", ITEM_ID)
    .maybeSingle();

  const previous = (existing?.config ?? {}) as Record<string, unknown>;
  const now = new Date().toISOString();

  const nextConfig: Record<string, unknown> = {
    ...previous,
    draft: payload,
    updated_at: now,
    last_mode: mode,
  };
  if (mode === "publish") {
    nextConfig.published = payload;
    nextConfig.published_at = now;
  }

  const { error } = await sb
    .from("developer_customizations")
    .upsert(
      {
        developer_id: dev.id,
        item_id: ITEM_ID,
        config: nextConfig,
      },
      { onConflict: "developer_id,item_id" },
    );

  if (error) {
    return NextResponse.json({ error: "Failed to save editor data" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    mode,
    updated_at: now,
    published_at: mode === "publish" ? now : (previous.published_at ?? null),
  });
}
