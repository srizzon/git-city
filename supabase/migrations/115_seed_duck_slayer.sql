-- ─── Seed: Duck Slayer emblem ──────────────────────────────────────────────
-- The Duck Boss event grants this via a reward rail (bundle.emblem_id). Seeded
-- here so it exists in every environment without hand-creating it in the admin.
-- ON CONFLICT DO NOTHING: never clobbers later admin edits to the same row.

BEGIN;

INSERT INTO emblems (id, name, description, family, tier, glyph, is_counter, milestones, criteria, xp_reward, active, sort_order)
VALUES (
  'duck_slayer',
  'Duck Slayer',
  'Faced the Duck Boss and lived to quack about it. The number is how many you''ve felled.',
  'events',
  'gold',
  'duck',
  true,
  '[{"count":1,"tier":"gold"},{"count":5,"tier":"diamond"}]'::jsonb,
  NULL,
  0,
  true,
  15
)
ON CONFLICT (id) DO NOTHING;

COMMIT;
