-- ─── Seed: Bankr Terminal raid vehicle ─────────────────────────────────────
-- A fully data-driven raid vehicle (the first GLB-backed one). Seeded here so it
-- exists in every environment without hand-creating it in the admin — the GLB
-- itself lives in Supabase Storage (cosmetic-models/vehicles/bankr_monitor.glb),
-- uploaded once per bucket via scripts/upload-cosmetic-models.mjs.
--
-- How the row drives everything (no code change required):
--   shop_section = 'battle' + render_kind = 'asset'  -> classifyItem() => 'vehicle',
--                                                        so the shop previews it
--                                                        with VehicleMesh (loads
--                                                        vehicles/<id>.glb by id).
--   metadata.type = 'raid_vehicle'                   -> raid loadout/equip detects
--                                                        it from the catalog.
--
-- ON CONFLICT DO NOTHING: never clobbers later admin edits to the same row
-- (matches the 115_seed_duck_slayer convention).
--
-- NOTE: pricing mirrors the premium legacy vehicle (Hacker Rig). Adjust the
-- price_* values here before merging if Bankr should be cheaper / pixels-only /
-- a sponsor freebie.

BEGIN;

INSERT INTO items (
  id, category, name, description,
  price_usd_cents, price_brl_cents, price_pixels,
  is_active, shop_section, render_kind, render_spec, metadata
)
VALUES (
  'bankr_monitor',
  'effect',
  'Bankr Terminal',
  'Raid vehicle: a retro-CRT trading terminal, flown into battle by the Bankr crew.',
  399, 1990, 500,
  true,
  'battle',
  'asset',
  '{"model":"vehicles/bankr_monitor.glb"}'::jsonb,
  '{"type":"raid_vehicle","emoji":"🏦"}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

COMMIT;
