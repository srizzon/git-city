export interface PortfolioProject {
  id: string;
  developer_id: number;
  title: string;
  description: string | null;
  role: string | null;
  tech_stack: string[];
  image_urls: string[];
  live_url: string | null;
  source_url: string | null;
  is_verified: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface PortfolioExperience {
  id: string;
  developer_id: number;
  company: string;
  role: string;
  period: string | null;
  impact_line: string | null;
  start_year: number | null;
  start_month: number | null;
  end_year: number | null;
  end_month: number | null;
  is_current: boolean;
  sort_order: number;
  created_at: string;
}

export type EndorsementStatus = "pending" | "approved" | "hidden";
export type EndorsementRelationship =
  | "worked_together"
  | "managed_by"
  | "mentored"
  | "open_source"
  | "other";

export interface PortfolioEndorsement {
  id: string;
  developer_id: number;
  endorser_id: number;
  skill_name: string;
  context_text: string;
  relationship: EndorsementRelationship;
  status: EndorsementStatus;
  weight: number;
  created_at: string;
  endorser?: {
    github_login: string;
    avatar_url: string | null;
    xp_level: number;
  };
}

export interface EndorsementAggregate {
  skill: string;
  count: number;
  top: Array<{
    github_login: string;
    avatar_url: string | null;
    context_text: string;
    relationship: EndorsementRelationship;
    xp_level: number;
  }>;
}
