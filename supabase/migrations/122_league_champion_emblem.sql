-- ─── League champion emblem ────────────────────────────────
-- Push-only counter emblem granted by the Monday league close
-- (claim key league:{league_id}:{week_start}). Frame evolves at 1/3/10 wins.

INSERT INTO emblems (id, name, description, family, tier, glyph, is_counter, milestones, criteria, xp_reward, active, sort_order)
VALUES (
  'league_champion',
  'Weekly Champion',
  'Won a league''s weekly race. The number is how many weeks.',
  'leagues',
  'bronze',
  'crown',
  true,
  '[{"count":1,"tier":"bronze"},{"count":3,"tier":"silver"},{"count":10,"tier":"gold"}]'::jsonb,
  NULL,
  0,
  true,
  40
)
ON CONFLICT (id) DO NOTHING;
