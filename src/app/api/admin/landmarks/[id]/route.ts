import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/auth-identity";
import {
  getById,
  updateLandmark,
  setActive,
  hardDelete,
} from "@/lib/landmarks/repository";
import { validateLandmarkInput } from "@/lib/landmarks/validation";

async function requireAdmin(): Promise<null | NextResponse> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminUser(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;
  const { id } = await ctx.params;
  const landmark = await getById(id);
  if (!landmark) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ landmark });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const v = validateLandmarkInput(body, { partial: true });
  if ("error" in v) {
    return NextResponse.json({ error: v.error }, { status: 400 });
  }

  try {
    const landmark = await updateLandmark(id, v.data);
    return NextResponse.json({ landmark });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Update failed";
    console.error("[landmarks] PATCH failed", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const hard = url.searchParams.get("hard") === "true";

  try {
    if (hard) await hardDelete(id);
    else await setActive(id, false);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Delete failed";
    console.error("[landmarks] DELETE failed", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
