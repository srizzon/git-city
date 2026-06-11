-- 101_cosmetics_catalog.sql
-- ─────────────────────────────────────────────────────────────────────────
-- Scalable cosmetics catalog. The shop is being rebuilt to (a) put a live 3D
-- preview at the centre (like admin/cosmetics) and (b) scale to thousands of
-- cosmetics without the per-item code sprawl we have today.
--
-- The fix is a DATA MODEL: a cosmetic becomes one catalog row that declares
-- HOW it renders (render_kind + render_spec) instead of needing a bespoke
-- TypeScript object + a hand-written switch case in several files.
--
--   render_kind = 'code'     -> bespoke Three.js component, keyed by render_spec.key
--                               (the ~25 existing cosmetics; never rewritten)
--   render_kind = 'asset'    -> generic GLB placed on the building from render_spec
--                               (model/attach/offset/scale/tint) — the path to thousands
--   render_kind = 'template' -> parametric effect; one template = many variants via params
--
-- ADDITIVE ONLY. We extend `items` (catalog *config*, not user data) and add two
-- new tables. No existing column is dropped or repurposed. FKs from `purchases`
-- and `developer_customizations` to items(id) are untouched.
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Sets — themed groupings (Fortnite "Set" / Roblox bundle). The main weapon
--    against catalog sprawl: 400 loose items is chaos, 40 sets of 10 is navigable.
create table if not exists cosmetic_sets (
  id          text primary key,
  name        text not null,
  description text,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

-- 2. Seasons — the live-ops calendar spine. Old content retires to the archive
--    (Collection) while the storefront stays small and current.
create table if not exists cosmetic_seasons (
  id          text primary key,
  name        text not null,
  starts_at   timestamptz,
  ends_at     timestamptz,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

-- 3. Extend items with catalog + render metadata (all nullable / defaulted, so
--    existing rows stay valid and existing code keeps reading what it reads).
alter table items add column if not exists set_id        text references cosmetic_sets(id)    on delete set null;
alter table items add column if not exists season_id     text references cosmetic_seasons(id) on delete set null;
alter table items add column if not exists render_kind   text not null default 'code'
  check (render_kind in ('code', 'asset', 'template'));
alter table items add column if not exists render_spec   jsonb not null default '{}'::jsonb;
alter table items add column if not exists tags          text[] not null default '{}';
alter table items add column if not exists thumbnail_url text;
alter table items add column if not exists sort_order    int  not null default 0;
-- Pair the existing `available_until` (migration 017) with a start, so the store
-- can render itself from per-item availability windows instead of a global flip.
alter table items add column if not exists available_from timestamptz;

-- 4. Indexes for scale: filtering + keyset pagination over thousands of rows.
create index if not exists idx_items_zone          on items (zone);
create index if not exists idx_items_set           on items (set_id);
create index if not exists idx_items_season        on items (season_id);
create index if not exists idx_items_rarity        on items (rarity);
create index if not exists idx_items_tags          on items using gin (tags);
create index if not exists idx_items_catalog_sort  on items (sort_order, id);
create index if not exists idx_items_available     on items (available_until);

-- 5. Backfill: every existing cosmetic keeps its current bespoke renderer,
--    addressed by id. This is catalog config (not user data) and is a no-op for
--    rows already migrated. New cosmetics will set 'asset'/'template' explicitly.
update items
   set render_spec = jsonb_build_object('key', id)
 where render_kind = 'code'
   and (render_spec is null or render_spec = '{}'::jsonb);

-- Comments for future maintainers.
comment on column items.render_kind   is 'How the cosmetic draws: code (bespoke component by render_spec.key), asset (GLB from render_spec), template (parametric effect).';
comment on column items.render_spec   is 'Render parameters. code:{key}. asset:{model,attach,offset,scale,rotation,tint,animation}. template:{template,params}.';
comment on column items.set_id        is 'Optional themed set (cosmetic_sets) for grouping/merchandising.';
comment on column items.season_id     is 'Optional live-ops season (cosmetic_seasons).';
comment on column items.tags          is 'Freeform tags for filters/featured rails (GIN-indexed). e.g. {neon,glow,animated}.';
comment on column items.thumbnail_url is 'Pre-rendered card thumbnail (Supabase Storage). Grid uses this; live 3D is reserved for the preview stage.';
