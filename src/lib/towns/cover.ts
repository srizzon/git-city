import "server-only";
import sharp from "sharp";
import { getSupabaseAdmin } from "@/lib/supabase";
import { LEAGUE_ASSETS_BUCKET, leagueAssetUrl } from "@/lib/league-city/identity";
import { COVER_H, COVER_W, coverDue, type CoverState } from "./cover-rules";

// ─── Town covers ────────────────────────────────────────────
// The picture of the town on its Discover card: a photo the town page takes
// of the city (see CoverShot in LeagueScene), re-encoded here so only a plain
// image of the right size is ever stored.

export class CoverError extends Error {}

type Row = { cover_path: string | null; cover_version: number | null; cover_pinned: boolean | null; cover_at: string | null; version: number };

export async function loadCover(leagueId: string): Promise<{ state: CoverState; cityVersion: number } | null> {
  const { data } = await getSupabaseAdmin()
    .from("league_cities")
    .select("cover_path, cover_version, cover_pinned, cover_at, version")
    .eq("league_id", leagueId)
    .maybeSingle<Row>();
  if (!data) return null;
  return {
    state: { path: data.cover_path, version: data.cover_version === null ? null : Number(data.cover_version), pinned: !!data.cover_pinned, at: data.cover_at },
    cityVersion: Number(data.version),
  };
}

/** Whether the town page should photograph the city now. */
export async function isCoverDue(leagueId: string): Promise<boolean> {
  const c = await loadCover(leagueId).catch(() => null);
  return !!c && coverDue(c.state, c.cityVersion, new Date());
}

/**
 * Stores a photo as the town's cover. `pinned` is the admin's own view,
 * which automatic photos never replace. Returns false when an automatic one
 * isn't due (someone else just took it, or the admin pinned one).
 */
export async function saveCover(leagueId: string, bytes: Uint8Array, pinned: boolean): Promise<boolean> {
  const current = await loadCover(leagueId);
  if (!current) throw new CoverError("This town has no city yet.");
  if (!pinned && !coverDue(current.state, current.cityVersion, new Date())) return false;

  let webp: Buffer;
  try {
    webp = await sharp(bytes, { limitInputPixels: 4096 * 4096 })
      .resize(COVER_W, COVER_H, { fit: "cover" })
      .webp({ quality: 80 })
      .toBuffer();
  } catch {
    throw new CoverError("That isn't an image.");
  }

  const sb = getSupabaseAdmin();
  const path = `covers/${leagueId}/${crypto.randomUUID()}.webp`;
  const { error: upErr } = await sb.storage
    .from(LEAGUE_ASSETS_BUCKET)
    .upload(path, webp, { contentType: "image/webp", cacheControl: "31536000", upsert: false });
  if (upErr) throw new Error(`cover upload failed: ${upErr.message}`);
  const { error } = await sb
    .from("league_cities")
    .update({ cover_path: path, cover_version: current.cityVersion, cover_pinned: pinned, cover_at: new Date().toISOString() })
    .eq("league_id", leagueId);
  if (error) throw new Error(`cover row failed: ${error.message}`);
  if (current.state.path) await sb.storage.from(LEAGUE_ASSETS_BUCKET).remove([current.state.path]).catch(() => {});
  return true;
}

export function coverUrl(path: string | null): string | null {
  return path ? leagueAssetUrl(path) : null;
}
