import {
  renderAdExpiredEmail,
  renderAdExpiringEmail,
  renderAdFollowup30dEmail,
  renderAdFollowup7dEmail,
  renderAdvertiserSignInEmail,
  type AdStats,
} from "../../ad-emails";
import {
  renderAdSaleEmail,
  renderLandmarkInquiryEmail,
  renderSponsorshipInquiryEmail,
  withUnsubscribeFooter,
} from "../../admin-emails";
import { renderLandmarkWelcomeEmail } from "../../landmarks/welcome-email";
import { renderWeeklyAdReportEmail, type AdReport } from "../../notification-senders/ad-report";
import type { Landmark } from "../../landmarks/types";
import type { EmailPreviews } from "./types";

const STATS: AdStats = { impressions: 48213, clicks: 612, linkClicks: 287, countries: 41 };

const REPORT: AdReport = {
  advertiserEmail: "ads@example.com",
  advertiserName: "Acme",
  ads: [
    { brand: "Acme Cloud", impressions: 31240, engagements: 402, linkClicks: 188, conversions: 12, ctr: "0.60%", convRate: "6.38%" },
    { brand: "Acme Blimp", impressions: 12873, engagements: 131, linkClicks: 61, conversions: 3, ctr: "0.47%", convRate: "4.92%" },
    { brand: "Acme Rooftop Sign", impressions: 4102, engagements: 22, linkClicks: 9, conversions: 0, ctr: "0.22%", convRate: "0%" },
  ],
  totals: { impressions: 48215, engagements: 555, linkClicks: 258, conversions: 15, ctr: "0.54%", convRate: "5.81%" },
  prevTotals: { impressions: 42810, engagements: 590, linkClicks: 231, conversions: 11 },
};

const LANDMARK: Landmark = {
  id: "preview",
  slug: "acme",
  name: "Acme",
  tagline: "",
  description: "",
  url: "https://example.com",
  features: [],
  accent: "#c8e64a",
  hitboxRadius: 0,
  hitboxHeight: 0,
  buildingKind: "tower",
  customComponent: null,
  templateConfig: null,
  priority: 0,
  ownerGithubLogins: ["srizzon"],
  active: true,
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
};

const UPDATE_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><BODY style="margin:0; background:#0d0d0f;">
<div style="max-width:600px; margin:0 auto; padding:40px 20px; font-family:sans-serif; color:#e8dcc8;"><h1>Sample product update</h1><p>Hand-written HTML sent by the broadcast route. The footer below is injected.</p></div>
</BODY></html>`;

// Sample renders for the admin preview (?template=<key>) and test sends.
export const ADS_PREVIEWS: EmailPreviews = {
  "ad-expiring": () => renderAdExpiringEmail("Acme Cloud", 2, STATS),
  "ad-expiring-no-stats": () => renderAdExpiringEmail("Acme Cloud", 1),
  "ad-expired": () => renderAdExpiredEmail("Acme Cloud", STATS),
  "ad-followup-7d": () => renderAdFollowup7dEmail("Acme Cloud", STATS, 184320),
  "ad-followup-30d": () => renderAdFollowup30dEmail("Acme Cloud", STATS, 184320, 171905),
  "ad-weekly-report": () => renderWeeklyAdReportEmail(REPORT),
  "ad-weekly-report-single": () =>
    renderWeeklyAdReportEmail({
      ...REPORT,
      advertiserName: null,
      ads: [REPORT.ads[0]],
      totals: { impressions: 31240, engagements: 402, linkClicks: 188, conversions: 0, ctr: "0.60%", convRate: "0%" },
      prevTotals: { impressions: 0, engagements: 0, linkClicks: 0, conversions: 0 },
    }),
  "ad-sign-in": () => renderAdvertiserSignInEmail("https://thegitcity.com/api/ads/auth/verify?token=preview"),
  "ad-landmark-welcome": () => renderLandmarkWelcomeEmail(LANDMARK),
  "admin-ad-sale": () =>
    renderAdSaleEmail({
      packageLabel: "Skyline",
      isLandmark: false,
      total: "$149.00",
      currency: "usd",
      customerEmail: "ads@example.com",
      vehicles: ["plane", "blimp", "rooftop_sign"],
      adIds: ["ad-3f9c2a71b0d84e55", "ad-8e41c0aa29f7d310", "ad-c2d7719e04ab6f82"],
      subscriptionId: "sub_1QxYzAbCdEfGhIjKlMn",
      startsAt: new Date("2026-09-25T14:02:00Z"),
      endsAt: new Date("2026-10-25T14:02:00Z"),
    }),
  "admin-ad-sale-landmark": () =>
    renderAdSaleEmail({
      packageLabel: "Landmark",
      isLandmark: true,
      total: "R$2490.00",
      currency: "brl",
      customerEmail: "founder@example.com",
      vehicles: ["landmark"],
      adIds: ["ad-5a0e9b7c1d2f3e44"],
      subscriptionId: null,
      startsAt: new Date("2026-09-25T14:02:00Z"),
      endsAt: new Date("2026-10-25T14:02:00Z"),
    }),
  "admin-landmark-inquiry": () =>
    renderLandmarkInquiryEmail({
      name: "Jane Doe",
      email: "jane.doe@acme-developer-platform.io",
      company: "Acme",
      website: "https://www.acme-developer-platform.io/landmarks",
      message: "Hi! We'd love a landmark for our launch next month.\n\nCan we get a building shaped like our logo?",
    }),
  "admin-sponsorship-inquiry": () =>
    renderSponsorshipInquiryEmail({
      name: "Jane Doe",
      email: "jane@example.com",
      company: "Acme",
      role: "Head of Marketing",
      website: "https://example.com",
      formatInterest: "Event sponsorship",
      budget: "$5k-10k",
      message: "We're planning a hackathon and want Git City in it.\nWhat formats do you offer?",
    }),
  "admin-update-footer": () => ({
    subject: "Sample product update",
    html: withUnsubscribeFooter(UPDATE_HTML, "https://thegitcity.com/api/unsubscribe?dev=0&cat=marketing&token=preview"),
  }),
};
