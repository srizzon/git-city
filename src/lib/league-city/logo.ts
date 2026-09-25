import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import { invalidateLeague } from "@/lib/leagues/cache";
import { LEAGUE_ASSETS_BUCKET } from "./identity";
import { pixelize } from "./logo-image";
import { ensureCity } from "./service";

// ─── League logo ────────────────────────────────────────────
// Stores a pixelized logo (logo-image.ts) in the public league-assets bucket
// under a new name per upload, so caches never serve the old one, and points
// the city at it.

export { LogoError, pixelize } from "./logo-image";

/** Uploads a pixelized logo and makes it the league's logo. Returns the asset id. */
export async function setLeagueLogo(
  leagueId: string,
  png: Buffer,
  source: "github_org" | "upload",
  createdBy: number | null,
): Promise<string> {
  const sb = getSupabaseAdmin();
  await ensureCity(leagueId);
  const path = `${leagueId}/${crypto.randomUUID()}.png`;
  const { error: upErr } = await sb.storage
    .from(LEAGUE_ASSETS_BUCKET)
    .upload(path, png, { contentType: "image/png", cacheControl: "31536000", upsert: false });
  if (upErr) throw new Error(`logo upload failed: ${upErr.message}`);
  const { data: asset, error } = await sb
    .from("league_assets")
    .insert({ league_id: leagueId, kind: "logo", path, source, created_by: createdBy })
    .select("id")
    .single();
  if (error || !asset) throw new Error(`logo row failed: ${error?.message}`);
  await sb.from("league_cities").update({ logo_asset_id: asset.id }).eq("league_id", leagueId);
  invalidateLeague(leagueId);
  return asset.id as string;
}

export async function removeLeagueLogo(leagueId: string): Promise<void> {
  await getSupabaseAdmin().from("league_cities").update({ logo_asset_id: null }).eq("league_id", leagueId);
  invalidateLeague(leagueId);
}

/**
 * A company league starts with its GitHub org avatar. Never throws: a failed
 * fetch leaves the league without a logo, no retries.
 */
export async function seedOrgLogo(leagueId: string, org: string): Promise<void> {
  try {
    const res = await fetch(`https://github.com/${encodeURIComponent(org)}.png?size=256`, {
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
    });
    if (!res.ok) return;
    const buf = new Uint8Array(await res.arrayBuffer());
    await setLeagueLogo(leagueId, await pixelize(buf), "github_org", null);
  } catch (err) {
    console.warn("[league-logo] org avatar failed", org, err instanceof Error ? err.message : err);
  }
}
