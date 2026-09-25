import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAuthedDeveloper } from "@/lib/auth-identity";
import { assignCityLot } from "@/lib/city-lots";

/**
 * The signed-in player's lot, assigned now if they have none. Called by the
 * home page when the player's building isn't in the city it loaded, so a
 * newcomer gets a real address before the next snapshot. Never cached.
 */
export async function POST() {
  const authed = await getAuthedDeveloper();
  if (!authed) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const lot = await assignCityLot(getSupabaseAdmin(), authed.dev.id);
  return NextResponse.json(
    { login: authed.dev.github_login, lot },
    { headers: { "Cache-Control": "no-store" } },
  );
}
