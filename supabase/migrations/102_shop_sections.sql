-- 102_shop_sections.sql
-- ─────────────────────────────────────────────────────────────────────────
-- Shop organisation. The catalog mixes fundamentally different purchases —
-- tower cosmetics, raid gear, consumable boosts — that players buy for
-- different reasons. Big stores (Valorant, League) split these into top-level
-- sections rather than one flat grid. `shop_section` is that primary axis.
--
--   building -> tower cosmetics (crown / roof / aura / faces + easter eggs)
--   battle   -> raid gear (vehicles, tags)
--   boost    -> consumables (war paint, armor, EMP, streak freeze)
--
-- Additive + backfill of catalog config (no user data touched).
-- ─────────────────────────────────────────────────────────────────────────

alter table items add column if not exists shop_section text
  check (shop_section is null or shop_section in ('building', 'battle', 'boost'));

-- Battle: raid vehicles + tags (catalog ids drive the raid system already).
update items set shop_section = 'battle'
 where shop_section is null
   and id in ('raid_helicopter', 'raid_drone', 'raid_rocket', 'tag_neon', 'tag_fire', 'tag_gold');

-- Boost: consumables (zone-less, single category).
update items set shop_section = 'boost'
 where shop_section is null and category = 'consumable';

-- Everything else is a tower cosmetic.
update items set shop_section = 'building' where shop_section is null;

create index if not exists idx_items_shop_section on items (shop_section);

comment on column items.shop_section is 'Top-level shop tab: building (tower cosmetics), battle (raid gear), boost (consumables).';
