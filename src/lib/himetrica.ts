/**
 * Himetrica analytics wrapper.
 * All calls are client-side only — safe to import anywhere but will no-op on the server.
 */

declare global {
  interface Window {
    himetrica?: {
      track: (event: string, props?: Record<string, unknown>) => void;
      identify: (traits: Record<string, unknown>) => void;
    };
  }
}

function hm() {
  if (typeof window === "undefined") return null;
  return window.himetrica ?? null;
}

// ─── Identify ────────────────────────────────────────────────

export function identifyUser(traits: {
  github_login: string;
  email?: string;
  developer_id?: number;
  contributions?: number;
  referrer?: string;
}) {
  hm()?.identify({
    name: traits.github_login,
    email: traits.email,
    github_login: traits.github_login,
    developer_id: traits.developer_id,
    contributions: traits.contributions,
    referrer: traits.referrer,
  });
}

// ─── Auth & Onboarding ──────────────────────────────────────

export function trackSignInClicked(source: string) {
  hm()?.track("sign_in_clicked", { source });
}

export function trackSignUpCompleted(github_login: string, ref?: string) {
  hm()?.track("sign_up_completed", { github_login, ref });
}

export function trackBuildingClaimed(github_login: string) {
  hm()?.track("building_claimed", { github_login });
}

export function trackFreeItemClaimed() {
  hm()?.track("free_item_claimed");
}

// ─── Shop Funnel ─────────────────────────────────────────────

export function trackShopPageView(source?: string, ref?: string) {
  hm()?.track("page_view_shop", { source, ref });
}

export function trackShopItemViewed(item_id: string, zone: string, price_cents: number) {
  hm()?.track("shop_item_viewed", { item_id, zone, price: price_cents / 100 });
}

export function trackCheckoutStarted(item_id: string, provider: string, price_cents: number, is_gift: boolean) {
  hm()?.track("checkout_started", { item_id, provider, price: price_cents / 100, is_gift });
}

export function trackPurchaseCompleted(item_id: string, price_cents: number, provider: string) {
  hm()?.track("purchase_completed", { item_id, price: price_cents / 100, provider });
}

export function trackGiftSent(item_id: string, receiver: string) {
  hm()?.track("gift_sent", { item_id, receiver });
}

// ─── Sky Ads ────────────────────────────────────────────────

export function trackSkyAdImpression(ad_id: string, ad_type: string, advertiser?: string) {
  hm()?.track("sky_ad_impression", { ad_id, ad_type, advertiser });
}

export function trackSkyAdClick(ad_id: string, ad_type: string, url?: string) {
  hm()?.track("sky_ad_click", { ad_id, ad_type, url });
}

export function trackSkyAdCtaClick(ad_id: string, ad_type: string) {
  hm()?.track("sky_ad_cta_click", { ad_id, ad_type });
}

export function trackAdvertisePageView(source?: string) {
  hm()?.track("advertise_page_view", { source });
}

export function trackAdvertiseCtaClick() {
  hm()?.track("advertise_cta_click");
}

// ─── Engagement ─────────────────────────────────────────────

export function trackBuildingClicked(target_login: string) {
  hm()?.track("building_clicked", { target_login });
}

export function trackKudosSent(target_login: string) {
  hm()?.track("kudos_sent", { target_login });
}

export function trackSearchUsed(query: string) {
  hm()?.track("search_used", { query });
}

export function trackProfileViewed(target_login: string) {
  hm()?.track("profile_viewed", { target_login });
}

export function trackLeaderboardViewed(tab: string) {
  hm()?.track("leaderboard_viewed", { tab });
}

export function trackItemEquipped(item_id: string, zone: string) {
  hm()?.track("item_equipped", { item_id, zone });
}

// ─── Referral ───────────────────────────────────────────────

export function trackReferralLinkLanded(referrer: string) {
  hm()?.track("referral_link_landed", { referrer });
}

export function trackShareClicked(method: string) {
  hm()?.track("share_clicked", { method });
}
