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

// ─── Sponsorship Funnel ─────────────────────────────────────

export function trackSponsorshipPageView(source?: string) {
  hm()?.track("sponsorship_page_view", { source });
}

export function trackSponsorshipCtaClick(cta?: string) {
  hm()?.track("sponsorship_cta_click", { cta });
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

// ─── Growth Optimization ────────────────────────────────────

export function trackSignInPromptShown() {
  hm()?.track("sign_in_prompt_shown");
}

export function trackSignInPromptClicked() {
  hm()?.track("sign_in_prompt_clicked");
}

export function trackDisabledButtonClicked(button_name: string) {
  hm()?.track("disabled_button_clicked", { button_name });
}

// ─── E.Arcade ───────────────────────────────────────────────

export function trackEArcadeClicked() {
  hm()?.track("earcade_clicked");
}

export function trackEArcadeSurveyStarted() {
  hm()?.track("earcade_survey_started");
}

export function trackEArcadeSurveyCompleted() {
  hm()?.track("earcade_survey_completed");
}

// ─── Sponsored Landmarks ────────────────────────────────────

export function trackLandmarkImpression(slug: string) {
  hm()?.track("landmark_impression", { slug });
}

export function trackLandmarkClicked(slug: string) {
  hm()?.track("landmark_clicked", { slug });
}

export function trackLandmarkCardViewed(slug: string) {
  hm()?.track("landmark_card_viewed", { slug });
}

export function trackLandmarkCtaClicked(slug: string, url: string) {
  hm()?.track("landmark_cta_clicked", { slug, url });
}

// ─── Jobs: Seeker Funnel ───────────────────────────────────

export function trackJobsPageView(props: { has_filters: boolean; filter_count: number; source?: string }) {
  hm()?.track("jobs_page_view", props);
}

export function trackJobsSearch(query: string, results_count: number) {
  hm()?.track("jobs_search", { query, results_count });
}

export function trackJobsFilterApplied(filter_type: string, value: string) {
  hm()?.track("jobs_filter_applied", { filter_type, value });
}

export function trackJobsSortChanged(sort: string) {
  hm()?.track("jobs_sort_changed", { sort });
}

export function trackJobCardClicked(job_id: string, position: number) {
  hm()?.track("job_card_clicked", { job_id, position });
}

export function trackJobDetailView(props: { job_id: string; company?: string; role?: string; seniority?: string; has_salary: boolean; is_native?: boolean }) {
  hm()?.track("job_detail_view", props);
}

export function trackJobApplyClicked(job_id: string, has_profile: boolean) {
  hm()?.track("job_apply_clicked", { job_id, has_profile });
}

export function trackJobApplySigninPrompted(job_id: string) {
  hm()?.track("job_apply_signin_prompted", { job_id });
}

export function trackJobApplyCompleted(job_id: string, company: string) {
  hm()?.track("job_apply_completed", { job_id, company });
}

export function trackJobExternalClicked(job_id: string, company: string) {
  hm()?.track("job_external_clicked", { job_id, company });
}

export function trackJobReportSubmitted(job_id: string, reason: string) {
  hm()?.track("job_report_submitted", { job_id, reason });
}

// ─── Jobs: Alerts ──────────────────────────────────────────

export function trackJobAlertSubscribed(source: "inline" | "footer", has_stack: boolean) {
  hm()?.track("job_alert_subscribed", { source, has_stack });
}

// ─── Jobs: Career Profile ──────────────────────────────────

export function trackCareerProfileCtaClicked(source: string) {
  hm()?.track("career_profile_cta_clicked", { source });
}

export function trackCareerProfileCreated(props: { skills_count: number; has_salary: boolean; open_to_work: boolean }) {
  hm()?.track("career_profile_created", props);
}

export function trackCareerProfileUpdated() {
  hm()?.track("career_profile_updated");
}

export function trackCareerProfileDeleted() {
  hm()?.track("career_profile_deleted");
}

export function trackCareerProfileViewed(target_login: string, is_own: boolean) {
  hm()?.track("career_profile_viewed", { target_login, is_own });
}

// ─── Jobs: Company / Recruiter Funnel ──────────────────────

export function trackForCompaniesPageView() {
  hm()?.track("for_companies_page_view");
}

export function trackForCompaniesCtaClicked(cta: string) {
  hm()?.track("for_companies_cta_clicked", { cta });
}

export function trackBusinessLoginStarted() {
  hm()?.track("business_login_started");
}

export function trackBusinessLoginEmailSent() {
  hm()?.track("business_login_email_sent");
}

export function trackCompanyProfileCreated(has_github_org: boolean) {
  hm()?.track("company_profile_created", { has_github_org });
}

export function trackJobPostStarted(has_draft: boolean) {
  hm()?.track("job_post_started", { has_draft });
}

export function trackJobPostStepCompleted(step: number) {
  hm()?.track("job_post_step_completed", { step });
}

export function trackJobPostSubmitted(props: { role: string; seniority: string; tier: string; has_salary: boolean; is_native?: boolean }) {
  hm()?.track("job_post_submitted", props);
}

export function trackJobCheckoutStarted(tier: string, listing_id: string) {
  hm()?.track("job_checkout_started", { tier, listing_id });
}

// ─── Jobs: Dashboard ───────────────────────────────────────

export function trackJobDashboardView(listings_count: number, active_count: number) {
  hm()?.track("job_dashboard_view", { listings_count, active_count });
}

export function trackJobListingAction(action: string, listing_id: string) {
  hm()?.track("job_listing_action", { action, listing_id });
}

export function trackJobCandidateHired(listing_id: string) {
  hm()?.track("job_candidate_hired", { listing_id });
}

export function trackJobCandidatesExported(listing_id: string, count: number) {
  hm()?.track("job_candidates_exported", { listing_id, count });
}

// ─── Jobs: My Applications ────────────────────────────────

export function trackMyApplicationsView(total: number, active: number, hired: number) {
  hm()?.track("my_applications_view", { total, active, hired });
}
