-- 103_loadout_meta_items.sql
-- ─────────────────────────────────────────────────────────────────────────
-- developer_customizations.item_id has a FK to items(id). The customization
-- table is overloaded to also store per-developer config under synthetic keys
-- ("loadout" = equipped building cosmetics, "raid_loadout" = equipped raid
-- gear, "loadout_presets" = saved looks). Those keys must therefore exist as
-- rows in items, or every equip/save write fails the FK constraint.
--
-- These are internal anchors only: is_active = false so they never surface in
-- the shop. Idempotent (ON CONFLICT DO NOTHING) — a no-op where they already
-- exist (e.g. production), and the fix where they don't (fresh/seeded DBs).
-- ─────────────────────────────────────────────────────────────────────────

insert into items (id, category, name, description, price_usd_cents, price_brl_cents, is_active)
values
  ('loadout',         'identity', 'Loadout (internal)',      'Stores a developer''s equipped building cosmetics.', 0, 0, false),
  ('raid_loadout',    'identity', 'Raid Loadout (internal)', 'Stores a developer''s equipped raid vehicle and tag.', 0, 0, false),
  ('loadout_presets', 'identity', 'Saved Looks (internal)',  'Stores a developer''s saved building looks.',         0, 0, false)
on conflict (id) do nothing;
