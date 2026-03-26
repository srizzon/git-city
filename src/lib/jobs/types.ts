// src/lib/jobs/types.ts

export type JobStatus = "draft" | "pending_review" | "active" | "paused" | "filled" | "expired" | "rejected";
export type JobTier = "standard" | "featured" | "premium";
export type JobSeniority = "junior" | "mid" | "senior" | "staff" | "lead";
export type JobContract = "clt" | "pj" | "contract";
export type JobWeb = "web2" | "web3" | "both";
export type JobRoleType = "frontend" | "backend" | "fullstack" | "devops" | "mobile" | "data" | "design" | "other";

export interface JobListing {
  id: string;
  company_id: string;
  title: string;
  description: string;
  salary_min: number;
  salary_max: number;
  salary_currency: string;
  role_type: JobRoleType;
  tech_stack: string[];
  seniority: JobSeniority;
  contract_type: JobContract;
  web_type: JobWeb;
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
  advertiser_id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  website: string;
  description: string | null;
  github_org: string | null;
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

export interface JobApplication {
  id: string;
  listing_id: string;
  developer_id: number;
  has_profile: boolean;
  created_at: string;
  // Joined
  listing?: JobListing;
}
