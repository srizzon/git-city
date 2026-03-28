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

