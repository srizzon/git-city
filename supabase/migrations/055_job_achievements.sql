-- 055_job_achievements.sql — Job-related achievements

INSERT INTO achievements (id, name, description, tier, category, threshold, reward_type, sort_order) VALUES
  ('career_ready', 'Career Ready', 'Create a Career Profile', 'bronze', 'jobs', 1, 'exclusive_badge', 900),
  ('job_hunter', 'Job Hunter', 'Apply to your first job', 'bronze', 'jobs', 1, 'exclusive_badge', 901),
  ('city_recruiter', 'City Recruiter', 'Refer a company that posts a job', 'silver', 'jobs', 1, 'exclusive_badge', 902),
  ('hired_in_the_city', 'Hired in the City', 'Get hired via Git City', 'gold', 'jobs', 1, 'exclusive_badge', 903)
ON CONFLICT (id) DO NOTHING;
