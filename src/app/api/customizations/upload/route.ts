import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

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
    return NextResponse.json({ error: "No GitHub login found" }, { status: 400 });
  }

  const sb = getSupabaseAdmin();

  // Validate developer
  const { data: dev } = await sb
    .from("developers")
    .select("id, claimed, claimed_by")
    .eq("github_login", githubLogin)
    .single();

  if (!dev || !dev.claimed || dev.claimed_by !== user.id) {
    return NextResponse.json({ error: "Building not found or not yours" }, { status: 403 });
  }

  // Count completed billboard purchases
  const { count: billboardCount } = await sb
    .from("purchases")
    .select("id", { count: "exact", head: true })
    .eq("developer_id", dev.id)
    .eq("item_id", "billboard")
    .eq("status", "completed");

  if (!billboardCount || billboardCount === 0) {
    return NextResponse.json({ error: "You don't own the billboard item" }, { status: 403 });
  }

  // Parse FormData
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  const slotIndexRaw = formData.get("slot_index");
  const slotIndex = slotIndexRaw !== null ? parseInt(slotIndexRaw as string, 10) : 0;

  if (isNaN(slotIndex) || slotIndex < 0) {
    return NextResponse.json({ error: "Invalid slot_index" }, { status: 400 });
  }

  if (slotIndex >= billboardCount) {
    return NextResponse.json(
      { error: `Invalid slot_index (you have ${billboardCount} billboard slots)` },
      { status: 400 },
    );
  }

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "Invalid file type. Use PNG, JPEG, WebP, or GIF." },
      { status: 400 },
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "File too large (max 2 MB)" }, { status: 400 });
  }

  // Ensure billboards bucket exists
  const { data: buckets } = await sb.storage.listBuckets();
  const bucketExists = buckets?.some((b) => b.name === "billboards");
  if (!bucketExists) {
    await sb.storage.createBucket("billboards", { public: true });
  }

  // Upload file (overwrite on re-upload)
  const ext = file.type.split("/")[1] === "jpeg" ? "jpg" : file.type.split("/")[1];
  const filePath = `${dev.id}_${slotIndex}.${ext}`;
  const fileBuffer = await file.arrayBuffer();

  const { error: uploadError } = await sb.storage.from("billboards").upload(filePath, fileBuffer, {
    contentType: file.type,
    upsert: true,
  });

  if (uploadError) {
    console.error("Upload error:", uploadError);
    return NextResponse.json({ error: "Failed to upload image" }, { status: 500 });
  }

  // Get public URL
  const { data: urlData } = sb.storage.from("billboards").getPublicUrl(filePath);

  const imageUrl = urlData.publicUrl;

  // Read existing config to build images array
  const { data: existingConfig } = await sb
    .from("developer_customizations")
    .select("config")
    .eq("developer_id", dev.id)
    .eq("item_id", "billboard")
    .maybeSingle();

  let images: string[] = [];
  if (existingConfig) {
    const cfg = existingConfig.config as Record<string, unknown>;
    if (Array.isArray(cfg?.images)) {
      images = [...(cfg.images as string[])];
    } else if (typeof cfg?.image_url === "string") {
      // Migrate legacy single image to array
      images = [cfg.image_url];
    }
  }

  // Extend array if needed and set the slot
  while (images.length <= slotIndex) {
    images.push("");
  }
  images[slotIndex] = imageUrl;

  // Upsert customization with images array
  const { error: upsertError } = await sb.from("developer_customizations").upsert(
    {
      developer_id: dev.id,
      item_id: "billboard",
      config: { images },
    },
    { onConflict: "developer_id,item_id" },
  );

  if (upsertError) {
    console.error("Upsert error:", upsertError);
    return NextResponse.json({ error: "Failed to save customization" }, { status: 500 });
  }

  return NextResponse.json({ success: true, image_url: imageUrl, slot_index: slotIndex, images });
}
