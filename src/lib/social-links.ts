// Social links shown as icons on profiles and building cards.
// Stored in developer_customizations (item_id = "social_links") as canonical https URLs.
// GitHub is never stored — always derived from github_login.

export const SOCIAL_PLATFORMS = ["linkedin", "twitter", "youtube", "website", "email"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export type SocialLinks = Partial<Record<SocialPlatform, string>>;

export const MAX_URL_LENGTH = 200;

type BrandPlatform = Exclude<SocialPlatform, "website" | "email">;

// Hosts allowed per platform. A brand icon must never point outside its own domain
// (phishing protection). `website` allows any https host; `email` is mailto-only.
const PLATFORM_HOSTS: Record<BrandPlatform, string[]> = {
  linkedin: ["linkedin.com"],
  twitter: ["x.com", "twitter.com"],
  youtube: ["youtube.com", "youtu.be"],
};

const HANDLE_RE = /^@?[a-zA-Z0-9_.\-]{1,60}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Where a bare handle lands when the user types "@foo" instead of a URL.
const HANDLE_URL: Record<BrandPlatform, (handle: string) => string> = {
  linkedin: (h) => `https://linkedin.com/in/${h}`,
  twitter: (h) => `https://x.com/${h}`,
  youtube: (h) => `https://youtube.com/@${h}`,
};

function hostMatches(host: string, allowed: string[]): boolean {
  return allowed.some((d) => host === d || host.endsWith(`.${d}`));
}

function parseHttpsUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  return url;
}

/**
 * Validate (or normalize a bare handle into) a URL for a platform.
 * Returns the canonical https URL, or null when the input is invalid.
 */
export function normalizeSocialUrl(platform: SocialPlatform, input: string): string | null {
  // Strip whitespace and control characters anywhere in the input.
  const raw = input.replace(/[\s\x00-\x1f\x7f]/g, "");
  if (!raw || raw.length > MAX_URL_LENGTH) return null;

  if (platform === "email") {
    const email = raw.replace(/^mailto:/i, "");
    return EMAIL_RE.test(email) ? `mailto:${email.toLowerCase()}` : null;
  }

  // Bare handle -> canonical URL (brand platforms only)
  if (platform !== "website" && !raw.includes("/") && !raw.includes(".") && HANDLE_RE.test(raw)) {
    return HANDLE_URL[platform](raw.replace(/^@/, ""));
  }

  // Tolerate missing scheme ("linkedin.com/in/foo") but never allow http:
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw) ? raw : `https://${raw}`;
  const url = parseHttpsUrl(withScheme);
  if (!url || url.href.length > MAX_URL_LENGTH) return null;

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (platform !== "website" && !hostMatches(host, PLATFORM_HOSTS[platform])) return null;
  if (platform === "website" && !host.includes(".")) return null;

  return url.href;
}

/**
 * Re-validation used at render time (defense in depth against legacy or
 * hand-edited DB rows). Only ever renders URLs that still pass the allowlist.
 */
export function sanitizeSocialLinks(config: unknown): SocialLinks {
  if (!config || typeof config !== "object") return {};
  const out: SocialLinks = {};
  for (const platform of SOCIAL_PLATFORMS) {
    const value = (config as Record<string, unknown>)[platform];
    if (typeof value !== "string" || value.length > MAX_URL_LENGTH) continue;
    if (platform === "email") {
      if (EMAIL_RE.test(value.replace(/^mailto:/i, "")) && value.startsWith("mailto:")) {
        out.email = value;
      }
      continue;
    }
    const url = parseHttpsUrl(value);
    if (!url) continue;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (platform !== "website" && !hostMatches(host, PLATFORM_HOSTS[platform])) continue;
    out[platform] = url.href;
  }
  return out;
}
