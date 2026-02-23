export interface SkyAd {
  id: string;
  text: string;
  brand?: string;
  description?: string;
  color: string;
  bgColor: string;
  link?: string;
  vehicle: "plane" | "blimp";
  priority: number;
}

export const MAX_PLANES = 3;
export const MAX_BLIMPS = 2;
export const MAX_TEXT_LENGTH = 80;

const ALLOWED_LINK_PATTERN = /^(https:\/\/|mailto:)/;
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export function validateAds(ads: SkyAd[]): SkyAd[] {
  return ads
    .filter((ad) => {
      if (ad.text.length > MAX_TEXT_LENGTH) return false;
      if (ad.link && !ALLOWED_LINK_PATTERN.test(ad.link)) return false;
      if (!HEX_COLOR_PATTERN.test(ad.color)) return false;
      if (!HEX_COLOR_PATTERN.test(ad.bgColor)) return false;
      return true;
    })
    .sort((a, b) => b.priority - a.priority);
}

export function getActiveAds(ads: SkyAd[]) {
  const valid = validateAds(ads);
  return {
    planeAds: valid.filter((a) => a.vehicle === "plane").slice(0, MAX_PLANES),
    blimpAds: valid.filter((a) => a.vehicle === "blimp").slice(0, MAX_BLIMPS),
  };
}

/** Append UTM params to an ad link. Skips mailto: links. */
export function buildAdLink(ad: SkyAd): string | undefined {
  if (!ad.link) return undefined;
  if (ad.link.startsWith("mailto:")) return ad.link;
  try {
    const url = new URL(ad.link);
    url.searchParams.set("utm_source", "gitcity");
    url.searchParams.set("utm_medium", "sky_ad");
    url.searchParams.set("utm_campaign", ad.id);
    url.searchParams.set("utm_content", ad.vehicle);
    return url.toString();
  } catch {
    return ad.link;
  }
}

/** Fire a tracking beacon to the sky-ads track API (non-blocking). */
export function trackAdEvent(adId: string, eventType: "impression" | "click" | "cta_click", githubLogin?: string) {
  const body = JSON.stringify({ ad_id: adId, event_type: eventType, ...(githubLogin && { github_login: githubLogin }) });
  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    navigator.sendBeacon("/api/sky-ads/track", new Blob([body], { type: "application/json" }));
  } else {
    fetch("/api/sky-ads/track", { method: "POST", body, keepalive: true }).catch(() => {});
  }
}

export const DEFAULT_SKY_ADS: SkyAd[] = [
  {
    id: "gitcity",
    text: "THEGITCITY.COM ★ YOUR CODE, YOUR CITY ★ THEGITCITY.COM",
    brand: "Git City",
    description: "A city built from GitHub contributions. Search your username and find your building among thousands of developers.",
    color: "#f8d880",
    bgColor: "#1a1018",
    link: "https://thegitcity.com",
    vehicle: "plane",
    priority: 100,
  },
  {
    id: "samuel",
    text: "HEY, I BUILD THIS! → SAMUELRIZZON.DEV",
    brand: "Samuel Rizzon",
    description: "Full-stack dev who builds weird and cool stuff. This city is one of them.",
    color: "#c8e64a",
    bgColor: "#1a1018",
    link: "https://www.samuelrizzon.dev/en.html",
    vehicle: "plane",
    priority: 90,
  },
  {
    id: "build",
    text: "YOUR AI COPILOT TO GROW ON X",
    brand: "ReplyOS",
    description: "I grew +1.2k followers and 1M views in 3 weeks using ReplyOS. Viral library, lead radar, post writer, auto-replies. Your AI copilot to grow on X.",
    color: "#ffffff",
    bgColor: "#2a1838",
    link: "https://reply-os.com",
    vehicle: "blimp",
    priority: 80,
  },
  {
    id: "advertise",
    text: "ADD YOUR AD HERE",
    brand: "Sky Ads",
    description: "Want your brand flying over Git City? Planes, blimps, your colors. Get in touch!",
    color: "#f8d880",
    bgColor: "#1a1018",
    link: "https://thegitcity.com/advertise",
    vehicle: "plane",
    priority: 10,
  },
];
