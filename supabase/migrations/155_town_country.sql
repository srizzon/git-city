-- 155: a town can stand for a country (ISO 3166-1 alpha-2, e.g. BR), so
-- Discover can list country towns on their own.

ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS country text CHECK (country IS NULL OR country ~ '^[A-Z]{2}$');
