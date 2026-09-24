import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/auth-identity";
import { createLandmark, listAll } from "@/lib/landmarks/repository";
import { validateLandmarkInput } from "@/lib/landmarks/validation";

async function requireAdmin(): Promise<null | NextResponse> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminUser(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function GET() {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;
  const landmarks = await listAll();
  return NextResponse.json({ landmarks });
}

export async function POST(req: NextRequest) {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const v = validateLandmarkInput(body);
  if ("error" in v) {
    return NextResponse.json({ error: v.error }, { status: 400 });
  }

  try {
    const landmark = await createLandmark({
      slug: v.data.slug!,
      name: v.data.name!,
      tagline: v.data.tagline!,
      description: v.data.description!,
      url: v.data.url!,
      features: v.data.features ?? [],
      accent: v.data.accent!,
      hitboxRadius: v.data.hitboxRadius,
      hitboxHeight: v.data.hitboxHeight,
      buildingKind: v.data.buildingKind!,
      customComponent: v.data.customComponent ?? null,
      templateConfig: v.data.templateConfig ?? null,
      priority: v.data.priority,
      ownerGithubLogins: v.data.ownerGithubLogins,
      active: v.data.active,
    });
    return NextResponse.json({ landmark });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to create";
    if (msg.includes("duplicate") || msg.includes("unique")) {
      return NextResponse.json({ error: "Slug already exists" }, { status: 409 });
    }
    console.error("[landmarks] POST failed", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
