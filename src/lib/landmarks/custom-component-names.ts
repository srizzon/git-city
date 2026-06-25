/**
 * Single source of truth for registered custom_component names.
 *
 * Server-safe (no React imports) so admin pages and API routes can import
 * it freely. The client-side `component-registry.ts` uses this type to
 * force a 1:1 mapping between declared names and real React components —
 * adding a name here without wiring a component will fail to compile.
 */
export const CUSTOM_COMPONENT_NAMES = [
  "firecrawl",
  "guaracloud",
  "solana-hackathon",
  "ultracontext",
  "sponsor-city",
] as const;

export type CustomComponentName = (typeof CUSTOM_COMPONENT_NAMES)[number];

export function isCustomComponentName(value: string): value is CustomComponentName {
  return (CUSTOM_COMPONENT_NAMES as readonly string[]).includes(value);
}
