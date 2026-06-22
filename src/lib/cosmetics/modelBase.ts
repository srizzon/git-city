// Single source of truth for where cosmetic GLB models are served from.
//
// Models live in Supabase Storage (bucket `cosmetic-models`), NOT in the repo —
// so adding a cosmetic is upload + a catalog row, never a git commit. Catalog
// rows store a RELATIVE path in render_spec.model (e.g. "vehicles/foo.glb") so
// they're environment-agnostic; this resolver turns that into a full URL.
//
// Prod/dev: set NEXT_PUBLIC_MODELS_BASE_URL to the bucket's public base, e.g.
//   https://<project>.supabase.co/storage/v1/object/public/cosmetic-models
// Falls back to "/models" (the local public dir) when unset.
//
// Migrating to Cloudflare R2 later (zero egress) = change this one env var.
export const MODELS_BASE = process.env.NEXT_PUBLIC_MODELS_BASE_URL || "/models";

/** Resolve a catalog model reference to a loadable URL.
 *  Full URLs (http/https) pass through; relative paths resolve against MODELS_BASE. */
export function resolveModelUrl(model: string): string {
  if (/^https?:\/\//.test(model)) return model;
  return `${MODELS_BASE}/${model.replace(/^\/+/, "")}`;
}
