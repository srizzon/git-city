// src/lib/jobs/constants.ts

export const JOB_TIERS = {
  free: { id: "free" as const, price_usd_cents: 0, label: "Free" },
  standard: { id: "standard" as const, price_usd_cents: 9900, label: "Standard" },
  featured: { id: "featured" as const, price_usd_cents: 24900, label: "Featured" },
  premium: { id: "premium" as const, price_usd_cents: 44900, label: "Premium" },
} as const;

export const FREE_LISTING_LIMIT = 1;

export const SENIORITY_LABELS: Record<string, string> = {
  intern: "Intern",
  junior: "Junior",
  mid: "Mid-Level",
  senior: "Senior",
  staff: "Staff",
  lead: "Lead",
  principal: "Principal",
  director: "Director+",
};

export const ROLE_TYPE_LABELS: Record<string, string> = {
  frontend: "Frontend",
  backend: "Backend",
  fullstack: "Full Stack",
  devops: "DevOps",
  mobile: "Mobile",
  data: "Data",
  design: "Design",
  cloud: "Cloud",
  security: "Security",
  qa: "QA / Testing",
  ai_ml: "AI / ML",
  blockchain: "Blockchain",
  embedded: "Embedded",
  sre: "SRE",
  gamedev: "Game Dev",
  engineering_manager: "Eng. Manager",
  other: "Other",
};

export const CONTRACT_LABELS: Record<string, string> = {
  fulltime: "Full-time",
  parttime: "Part-time",
  clt: "CLT",
  pj: "PJ",
  contract: "Contract",
  freelance: "Freelance",
  internship: "Internship",
};

export const WEB_TYPE_LABELS: Record<string, string> = {
  web2: "Web2",
  web3: "Web3",
  both: "Both",
};

export const LOCATION_TYPE_LABELS: Record<string, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
};

export const LOCATION_RESTRICTION_LABELS: Record<string, string> = {
  worldwide: "Worldwide",
  americas: "Americas",
  europe: "Europe",
  asia: "Asia",
  africa: "Africa",
  oceania: "Oceania",
  latam: "Latin America",
  specific: "Specific countries",
};

export const SALARY_PERIOD_LABELS: Record<string, string> = {
  monthly: "/mo",
  annual: "/yr",
};

export const BENEFITS_LIST = [
  { id: "remote_work", label: "Remote work" },
  { id: "flexible_hours", label: "Flexible hours" },
  { id: "async_culture", label: "Async culture" },
  { id: "four_day_week", label: "4-day workweek" },
  { id: "health_insurance", label: "Health insurance" },
  { id: "dental_vision", label: "Dental & Vision" },
  { id: "unlimited_pto", label: "Unlimited PTO" },
  { id: "paid_time_off", label: "Paid time off" },
  { id: "parental_leave", label: "Parental leave" },
  { id: "equity", label: "Equity / Stock options" },
  { id: "profit_sharing", label: "Profit sharing" },
  { id: "401k", label: "401(k) / Retirement" },
  { id: "learning_budget", label: "Learning budget" },
  { id: "home_office", label: "Home office budget" },
  { id: "coworking", label: "Coworking budget" },
  { id: "gym_wellness", label: "Gym / Wellness" },
  { id: "mental_health", label: "Mental health support" },
  { id: "company_retreats", label: "Company retreats" },
  { id: "no_whiteboard", label: "No whiteboard interviews" },
  { id: "no_monitoring", label: "No monitoring" },
  { id: "pay_crypto", label: "Pay in crypto" },
] as const;

export const LISTING_DURATION_DAYS = 30;
export const EXPIRY_WARNING_DAYS = 5;
export const REJECTION_RESUBMIT_DAYS = 7;

// Free email domains — companies must use corporate email
export const FREE_EMAIL_DOMAINS = [
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com",
  "aol.com", "icloud.com", "mail.com", "protonmail.com",
  "tutanota.com", "zoho.com", "yandex.com", "live.com",
];
