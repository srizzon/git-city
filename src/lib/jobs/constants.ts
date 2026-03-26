// src/lib/jobs/constants.ts

export const JOB_TIERS = {
  standard: { id: "standard" as const, price_usd_cents: 9900, label: "Standard" },
  featured: { id: "featured" as const, price_usd_cents: 19900, label: "Featured" },
  premium: { id: "premium" as const, price_usd_cents: 29900, label: "Premium" },
} as const;

export const SENIORITY_LABELS: Record<string, string> = {
  junior: "Júnior",
  mid: "Pleno",
  senior: "Sênior",
  staff: "Staff",
  lead: "Lead",
};

export const ROLE_TYPE_LABELS: Record<string, string> = {
  frontend: "Frontend",
  backend: "Backend",
  fullstack: "Fullstack",
  devops: "DevOps",
  mobile: "Mobile",
  data: "Data",
  design: "Design",
  other: "Other",
};

export const CONTRACT_LABELS: Record<string, string> = {
  clt: "CLT",
  pj: "PJ",
  contract: "Contract",
};

export const WEB_TYPE_LABELS: Record<string, string> = {
  web2: "Web2",
  web3: "Web3",
  both: "Both",
};

export const LISTING_DURATION_DAYS = 30;
export const EXPIRY_WARNING_DAYS = 5;
export const REJECTION_RESUBMIT_DAYS = 7;

// Free email domains — companies must use corporate email
export const FREE_EMAIL_DOMAINS = [
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com",
  "aol.com", "icloud.com", "mail.com", "protonmail.com",
  "tutanota.com", "zoho.com", "yandex.com", "live.com",
];
