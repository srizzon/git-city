// src/lib/jobs/types.ts

export type JobStatus = "draft" | "pending_review" | "active" | "paused" | "filled" | "expired" | "rejected";
export type JobTier = "free" | "standard" | "featured" | "premium";
export type JobSeniority = "intern" | "junior" | "mid" | "senior" | "staff" | "lead" | "principal" | "director";
export type JobContract = "clt" | "pj" | "contract" | "fulltime" | "parttime" | "freelance" | "internship";
export type JobWeb = "web2" | "web3" | "both";
export type JobRoleType = "frontend" | "backend" | "fullstack" | "devops" | "mobile" | "data" | "design" | "cloud" | "security" | "qa" | "ai_ml" | "blockchain" | "embedded" | "sre" | "gamedev" | "engineering_manager" | "other";
export type JobLocationType = "remote" | "hybrid" | "onsite";
export type JobLocationRestriction = "worldwide" | "americas" | "europe" | "asia" | "africa" | "oceania" | "latam" | "specific";
export type JobSalaryPeriod = "monthly" | "annual";

export interface JobListing {
  id: string;
  company_id: string;
  title: string;
  description: string;
  salary_min: number;
  salary_max: number;
  salary_currency: string;
  salary_period: JobSalaryPeriod;
  role_type: JobRoleType;
  tech_stack: string[];
  seniority: JobSeniority;
  contract_type: JobContract;
  web_type: JobWeb;
  location_type: JobLocationType;
  location_restriction: JobLocationRestriction;
  location_countries: string[];
  location_city: string | null;
  location_timezone: string | null;
  benefits: string[];
  how_to_apply: string | null;
  apply_url: string;
  language: string;
  language_pt_br: string | null;
  badge_response_guaranteed: boolean;
  badge_no_ai_screening: boolean;
  status: JobStatus;
  tier: JobTier;
  rejection_reason: string | null;
  stripe_session_id: string | null;
  published_at: string | null;
  expires_at: string | null;
  filled_at: string | null;
  created_at: string;
  updated_at: string;
  view_count: number;
  apply_count: number;
  profile_count: number;
  // Joined
  company?: JobCompanyProfile;
}

export interface JobCompanyProfile {
  id: string;
  advertiser_id: string | null;
  name: string;
  slug: string;
  logo_url: string | null;
  website: string;
  description: string | null;
  github_org: string | null;
}

export interface JobCompanyProfileAdmin extends JobCompanyProfile {
  created_by: string | null;
  hired_count: number;
  last_dashboard_visit: string | null;
  created_at: string;
  updated_at: string;
  advertiser_email?: string | null;
  listings_count?: number;
  active_count?: number;
}

export interface CareerProfile {
  id: number;
  skills: string[];
  seniority: JobSeniority;
  years_experience: number | null;
  bio: string;
  web_type: JobWeb;
  contract_type: JobContract[];
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string;
  salary_visible: boolean;
  languages: string[];
  timezone: string | null;
  link_portfolio: string | null;
  link_linkedin: string | null;
  link_website: string | null;
  open_to_work: boolean;
  created_at: string;
  updated_at: string;
}

export type ApplicationStatus = "applied" | "hired";

export interface JobApplication {
  id: string;
  listing_id: string;
  developer_id: number;
  has_profile: boolean;
  status: ApplicationStatus;
  status_changed_at: string | null;
  created_at: string;
  // Joined
  listing?: JobListing;
}

export type CandidateBadge =
  | "top_contributor"
  | "active_streak"
  | "full_portfolio"
  | "open_source"
  | "verified_profile";

export interface CandidateBadgeInfo {
  id: CandidateBadge;
  label: string;
  color: string;
}

export interface CandidateWithScore {
  developer_id: number;
  github_login: string;
  contributions: number;
  stars: number;
  repos: number;
  streak: number;
  level: number;
  has_profile: boolean;
  status: ApplicationStatus;
  applied_at: string | undefined;
  profile: {
    seniority: string;
    years_experience: number | null;
    web_type: string;
    skills: string[];
    bio: string;
  } | null;
  skill_match: number;
  skill_total: number;
  quality_score: number;
  badges: CandidateBadge[];
}
