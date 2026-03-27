import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { PROJECT_IMAGE_MAX_SIZE, MAX_PROJECT_IMAGES } from "@/lib/portfolio/constants";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const BUCKET = "portfolio";

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = getSupabaseAdmin();
  const { data: dev } = await admin.from("developers").select("id").eq("claimed_by", user.id).single();
  if (!dev) return NextResponse.json({ error: "No developer profile" }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const projectId = formData.get("project_id") as string | null;
  const imageIndex = parseInt(formData.get("image_index") as string ?? "0", 10);

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (!projectId) return NextResponse.json({ error: "project_id required" }, { status: 400 });
  if (imageIndex < 0 || imageIndex >= MAX_PROJECT_IMAGES) {
    return NextResponse.json({ error: `image_index must be 0-${MAX_PROJECT_IMAGES - 1}` }, { status: 400 });
  }

  // Validate file
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Only PNG, JPEG, WebP allowed" }, { status: 400 });
  }
  if (file.size > PROJECT_IMAGE_MAX_SIZE) {
    return NextResponse.json({ error: "Max file size is 2MB" }, { status: 400 });
  }

  // Verify project ownership
  const { data: project } = await admin
    .from("portfolio_projects")
    .select("id, image_urls")
    .eq("id", projectId)
    .eq("developer_id", dev.id)
    .single();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  // Ensure bucket exists
  const { data: buckets } = await admin.storage.listBuckets();
  if (!buckets?.find((b) => b.name === BUCKET)) {
    await admin.storage.createBucket(BUCKET, { public: true });
  }

  // Upload
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `projects/${dev.id}/${projectId}_${imageIndex}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadError) {
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }

  const { data: urlData } = admin.storage.from(BUCKET).getPublicUrl(path);
  const publicUrl = urlData.publicUrl;

  // Update project image_urls
  const imageUrls = [...(project.image_urls ?? [])];
  imageUrls[imageIndex] = publicUrl;
  // Remove trailing nulls/undefined
  while (imageUrls.length > 0 && !imageUrls[imageUrls.length - 1]) imageUrls.pop();

  await admin
    .from("portfolio_projects")
    .update({ image_urls: imageUrls })
    .eq("id", projectId);

  return NextResponse.json({ url: publicUrl, image_urls: imageUrls });
}
