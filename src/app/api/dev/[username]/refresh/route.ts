import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getContributionStatus, refreshBuildingContributions } from "@/lib/contribution-refresh";
import { createServerSupabase } from "@/lib/supabase-server";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const NO_STORE = { "Cache-Control": "no-store" };

// GET: when this building's commits were last synced. POST: sync them now
// (at most once a minute per building; see REFRESH_COOLDOWN_MS). Syncing
// needs a signed-in player, capped per player, so nobody can walk the city
// spending GitHub quota.
export async function GET(_req: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const status = await getContributionStatus(username);
  if (!status) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
  return NextResponse.json(status, { headers: NO_STORE });
}

export async function POST(_req: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const auth = await createServerSupabase();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "sign_in" }, { status: 401, headers: NO_STORE });
  if (!rateLimit(`commits-refresh:${user.id}`, 20, 60 * 60_000).ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: NO_STORE });
  }
  const result = await refreshBuildingContributions(username);
  if (!result.ok) {
    const status = result.error === "not_found" ? 404 : 502;
    return NextResponse.json({ error: result.error }, { status, headers: NO_STORE });
  }
  if (result.refreshed) revalidatePath(`/dev/${result.status.login}`);
  return NextResponse.json(
    { ...result.status, previous: result.previous, refreshed: result.refreshed },
    { headers: NO_STORE },
  );
}
