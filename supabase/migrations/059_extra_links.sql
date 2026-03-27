-- 059_extra_links.sql
-- Add dynamic links support to career profiles

ALTER TABLE career_profiles
  ADD COLUMN extra_links jsonb DEFAULT '[]';

-- extra_links format: [{ "label": "GitHub", "url": "https://github.com/user" }, ...]
