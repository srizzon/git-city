-- 104_profile_meta_item.sql
-- ─────────────────────────────────────────────────────────────────────────
-- developer_customizations.item_id has a FK to items(id). The profile
-- showcase (featured achievements + equipped title) is stored under the
-- synthetic key "profile", which must exist as a row in items or every
-- showcase save fails the FK constraint. Same pattern as 103.
--
-- Internal anchor only: is_active = false so it never surfaces in the shop.
-- Idempotent (ON CONFLICT DO NOTHING).
-- ─────────────────────────────────────────────────────────────────────────

insert into items (id, category, name, description, price_usd_cents, price_brl_cents, is_active)
values
  ('profile', 'identity', 'Profile Showcase (internal)', 'Stores a developer''s featured achievements and equipped title.', 0, 0, false)
on conflict (id) do nothing;
