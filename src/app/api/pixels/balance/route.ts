import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getBalance } from "@/lib/pixels";

export async function GET() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const sb = getSupabaseAdmin();
  const { data: dev } = await sb
    .from("developers")
    .select("id")
    .eq("claimed_by", user.id)
    .single();

  if (!dev) return NextResponse.json({ balance: 0 });

  const wallet = await getBalance(dev.id);
  return NextResponse.json(wallet);
}
