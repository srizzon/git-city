-- 105_referral_pixels_rule.sql
-- ─────────────────────────────────────────────────────────────────────────
-- Referral reward: +25 PX per dev who joins through your invite link.
-- Source "social" is intentionally NOT in earn_pixels' global 50 PX daily
-- grind cap (daily_commit/streak_bonus/achievement/city_action) — a referral
-- is a high-value acquisition event, not grind. Abuse is bounded by
-- max_per_day (5) and by the idempotency key (one credit per referred dev,
-- set by the caller in auth-provision).
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO earn_rules (id, source, pixels, cooldown_hours, max_per_day, description) VALUES
  ('referral', 'social', 25, NULL, 5, 'Convidar um dev para a cidade')
ON CONFLICT (id) DO NOTHING;
