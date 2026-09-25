import { renderJobApplicationConfirmedEmail } from "../../notification-senders/job-application-confirmed";
import { renderJobApplicationReceivedEmail, renderJobApplicationsBatchEmail } from "../../notification-senders/job-application-received";
import { renderJobApprovedEmail } from "../../notification-senders/job-approved";
import { renderJobCompanyWelcomeEmail } from "../../notification-senders/job-company-welcome";
import { renderJobDigestEmail, type MatchingJob } from "../../notification-senders/job-digest";
import { renderJobExpiredEmail, renderJobExpiringEmail } from "../../notification-senders/job-expiry";
import { renderJobFilledEmail } from "../../notification-senders/job-filled";
import { renderJobHiredEmail } from "../../notification-senders/job-hired";
import { renderJobNotifySignupEmail } from "../../notification-senders/job-notify-signup";
import { renderJobPendingReviewEmail } from "../../notification-senders/job-pending-review";
import { renderJobPerformanceReportEmail } from "../../notification-senders/job-performance-report";
import { renderJobProfileNudgeEmail } from "../../notification-senders/job-profile-nudge";
import { renderJobReferralConvertedEmail } from "../../notification-senders/job-referral-converted";
import { renderJobRejectedEmail } from "../../notification-senders/job-rejected";
import { renderJobReportedAdminEmail, renderJobReportedEmail } from "../../notification-senders/job-reported";
import { PREVIEW_LINKS, type EmailPreviews } from "./types";

// Transactional mail (forceSend) has no unsubscribe link, only email settings.
const TRANSACTIONAL = {};
const LISTING_ID = "3f6c1a52-9d1e-4b7a-8a51-2c0e4f7d9b10";
const TITLE = "Senior Frontend Engineer";
const COMPANY = "Acme Corp";

const DIGEST_JOBS: MatchingJob[] = [
  { id: LISTING_ID, title: TITLE, companyName: COMPANY, seniority: "senior", locationType: "remote", salaryMin: 140000, salaryMax: 180000, currency: "USD", matchedSkills: ["React", "Typescript"] },
  { id: "b1", title: "Full Stack Developer", companyName: "Nimbus Labs", seniority: "mid", locationType: "hybrid", salaryMin: null, salaryMax: null, currency: null, matchedSkills: ["Node"] },
  { id: "b2", title: "Staff Platform Engineer", companyName: "Orbital", seniority: "staff", locationType: "remote", salaryMin: 200000, salaryMax: 240000, currency: "USD", matchedSkills: ["Typescript", "Go"] },
  { id: "b3", title: "Frontend Developer", companyName: "Pixelworks", seniority: "junior", locationType: "onsite", salaryMin: 9000, salaryMax: 12000, currency: "BRL", matchedSkills: ["Vue"] },
];

const MANY_JOBS: MatchingJob[] = Array.from({ length: 10 }, (_, i) => ({ ...DIGEST_JOBS[i % 4], id: `m${i}` }));

// Sample renders for the admin preview (?template=<key>) and test sends.
export const JOBS_PREVIEWS: EmailPreviews = {
  // Developer side
  "job-application-confirmed": () => renderJobApplicationConfirmedEmail({ listingTitle: TITLE, companyName: COMPANY, hasProfile: true }, TRANSACTIONAL),
  "job-application-confirmed-no-profile": () => renderJobApplicationConfirmedEmail({ listingTitle: TITLE, companyName: COMPANY, hasProfile: false }, TRANSACTIONAL),
  "job-hired": () => renderJobHiredEmail({ login: "srizzon", companyName: COMPANY, listingTitle: TITLE }, TRANSACTIONAL),
  "job-filled": () => renderJobFilledEmail({ listingTitle: TITLE, companyName: COMPANY }, PREVIEW_LINKS),
  "job-notify-signup": () => renderJobNotifySignupEmail(12, TRANSACTIONAL),
  "job-profile-nudge": () => renderJobProfileNudgeEmail(3, PREVIEW_LINKS),
  "job-referral-converted": () => renderJobReferralConvertedEmail({ login: "srizzon", companyName: COMPANY }, PREVIEW_LINKS),
  "job-digest": () => renderJobDigestEmail(DIGEST_JOBS, PREVIEW_LINKS),
  "job-digest-single": () => renderJobDigestEmail(DIGEST_JOBS.slice(0, 1), PREVIEW_LINKS),
  "job-digest-many": () => renderJobDigestEmail(MANY_JOBS, PREVIEW_LINKS),

  // Company side
  "job-company-welcome": () => renderJobCompanyWelcomeEmail({ email: "hiring@acme.dev", companyName: COMPANY }),
  "job-approved": () => renderJobApprovedEmail({ listingTitle: TITLE, listingId: LISTING_ID, expiresAt: "2026-10-25T12:00:00Z" }),
  "job-rejected": () =>
    renderJobRejectedEmail({
      listingTitle: "Backend Developer",
      reason: "The description is too short. Add what the role involves, the stack you use and the salary range, then send it back to us.",
    }),
  "job-reported": () => renderJobReportedEmail({ listingTitle: TITLE }),
  "job-application-received": () =>
    renderJobApplicationReceivedEmail({
      listingTitle: TITLE,
      listingId: LISTING_ID,
      application: {
        developerLogin: "janedoe",
        hasProfile: true,
        firstName: "Jane",
        lastName: "Doe",
        email: "jane@doe.dev",
        phone: "+1 415 555 0134",
        linkedinUrl: "https://www.linkedin.com/in/janedoe/",
        resumeUrl: "https://doe.dev/resume.pdf",
        seniority: "senior",
        salaryMin: 150000,
        salaryMax: 175000,
        salaryCurrency: "USD",
        skills: ["React", "TypeScript", "Next.js", "GraphQL", "Node.js", "Figma"],
        bio: "Frontend engineer who has spent six years building design systems and fast React apps. Currently leading the web platform team at a fintech startup.",
      },
    }),
  "job-application-received-minimal": () =>
    renderJobApplicationReceivedEmail({
      listingTitle: TITLE,
      listingId: LISTING_ID,
      application: { developerLogin: "kristoferborges", hasProfile: true, email: "kris@example.com" },
    }),
  "job-applications-batch": () =>
    renderJobApplicationsBatchEmail({
      listingTitle: TITLE,
      listingId: LISTING_ID,
      applications: [
        { login: "janedoe", hasProfile: true, firstName: "Jane", lastName: "Doe" },
        { login: "pyromains", hasProfile: true, firstName: "Pedro", lastName: "Mains" },
        { login: "zappymanwho", hasProfile: true },
      ],
    }),
  "job-applications-batch-many": () =>
    renderJobApplicationsBatchEmail({
      listingTitle: TITLE,
      listingId: LISTING_ID,
      applications: Array.from({ length: 14 }, (_, i) => ({ login: `dev${i + 1}`, hasProfile: true, firstName: i % 2 ? "Sam" : null, lastName: i % 2 ? `Tester ${i + 1}` : null })),
    }),
  "job-expiring": () => renderJobExpiringEmail({ listingTitle: TITLE, daysLeft: 5, views: 1234, applies: 47 }),
  "job-expiring-last-day": () => renderJobExpiringEmail({ listingTitle: TITLE, daysLeft: 1, views: 88, applies: 0 }),
  "job-expired": () => renderJobExpiredEmail({ listingTitle: TITLE, views: 3480, applies: 112, hires: 1 }),
  "job-expired-no-hires": () => renderJobExpiredEmail({ listingTitle: TITLE, views: 540, applies: 9, hires: 0 }),
  "job-weekly-report": () =>
    renderJobPerformanceReportEmail({
      companyName: COMPANY,
      companyEmail: "hiring@acme.dev",
      listings: [
        { title: TITLE, views: 812, applies: 31, profileViews: 0, status: "active" },
        { title: "Backend Developer", views: 402, applies: 14, profileViews: 0, status: "active" },
        { title: "DevOps Engineer", views: 20, applies: 2, profileViews: 0, status: "expired" },
      ],
      totals: { views: 1234, applies: 47, profileViews: 0 },
      prevTotals: { views: 1010, applies: 52, profileViews: 0 },
    }),
  "job-weekly-report-single": () =>
    renderJobPerformanceReportEmail({
      companyName: COMPANY,
      companyEmail: "hiring@acme.dev",
      listings: [{ title: TITLE, views: 96, applies: 4, profileViews: 3, status: "active" }],
      totals: { views: 96, applies: 4, profileViews: 3 },
      prevTotals: { views: 0, applies: 0, profileViews: 0 },
    }),

  // Admin moderation
  "job-pending-review": () => renderJobPendingReviewEmail({ listingTitle: TITLE, companyName: COMPANY, tier: "featured", listingId: LISTING_ID }),
  "job-reported-admin": () => renderJobReportedAdminEmail({ listingTitle: TITLE, companyName: COMPANY, reportCount: 10, listingId: LISTING_ID }),
};
