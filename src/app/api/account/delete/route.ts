import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { deleteAccount } from "@/lib/account-delete";

export async function POST() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Every building this login claimed goes with it
  const { data: owned } = await getSupabaseAdmin()
    .from("developers")
    .select("id, github_login")
    .eq("claimed_by", user.id);

  const ok = await deleteAccount({ authUserId: user.id, developers: owned ?? [] }, "self");
  if (!ok) {
    return NextResponse.json(
      { error: "Couldn't delete your account. Try again or email us." },
      { status: 500 },
    );
  }

  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
