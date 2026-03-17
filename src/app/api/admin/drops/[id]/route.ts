import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getGithubLoginFromUser, isAdminGithubLogin } from "@/lib/admin";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const login = getGithubLoginFromUser(user);
  if (!isAdminGithubLogin(login)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = getSupabaseAdmin();

  const { error } = await admin.from("building_drops").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: "Failed to delete drop" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
