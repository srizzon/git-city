import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getGithubLoginFromUser, isAdminGithubLogin } from "@/lib/admin";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminGithubLogin(getGithubLoginFromUser(user))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  const body = await req.json();
  const { action } = body;

  switch (action) {
    case "pause":
      await admin
        .from("job_listings")
        .update({ status: "paused" })
        .eq("id", id)
        .in("status", ["active"]);
      break;

    case "resume":
      await admin
        .from("job_listings")
        .update({ status: "active" })
        .eq("id", id)
        .eq("status", "paused");
      break;

    case "delete":
      await admin.from("job_listings").delete().eq("id", id);
      break;

    default:
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
