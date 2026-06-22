-- 109_social_links_meta_item.sql
-- ─────────────────────────────────────────────────────────────────────────
-- developer_customizations.item_id has a FK to items(id). Social links
-- (LinkedIn / X / YouTube / website icons on the profile) are stored under
-- the synthetic key "social_links", which must exist as a row in items or
-- every save fails the FK constraint. Same pattern as 103/104.
--
-- Internal anchor only: is_active = false so it never surfaces in the shop.
-- Idempotent (ON CONFLICT DO NOTHING).
-- ─────────────────────────────────────────────────────────────────────────

insert into items (id, category, name, description, price_usd_cents, price_brl_cents, is_active)
values
  ('social_links', 'identity', 'Social Links (internal)', 'Stores a developer''s social links shown as icons on the profile and city card.', 0, 0, false)
on conflict (id) do nothing;
