# Git City

3D pixel art city built from real GitHub data. Buildings represent developers: height = contributions, width = repos, lit windows = recent activity.

## Tech stack

- **Frontend:** Next.js App Router, Three.js (instanced rendering), TypeScript
- **Backend:** Supabase (Postgres + Auth + Realtime)
- **Payments:** none. Git City takes no money; PX is earned in-game, and GITC burned for PX is the only token flow
- **Deployment:** Vercel

## Project structure

```
src/
  app/              Next.js pages and API routes
  components/       React + Three.js components
  lib/              Core game logic (raids, dailies, XP, items, etc.)
supabase/
  migrations/       Sequential SQL migrations (001_, 002_, ...)
```

## Code conventions

- TypeScript everywhere, no `any`
- `getSupabaseAdmin()` for server-side writes (bypasses RLS)
- `createServerSupabase()` for auth in API routes (cookie-based)
- API routes validate auth, then use admin client for DB operations
- Items use a zone system: crown, roof, aura, faces
- Loadout stored in `developer_customizations` table with `item_id = "loadout"`

## Database

- Migrations in `supabase/migrations/`, numbered sequentially
- Never modify existing migrations, always create new ones
- Run locally with `npx supabase db push`
- **NEVER run UPDATE or DELETE on production data without explicit user approval**
- **NEVER NULL out, drop, or modify columns that contain user data (emails, API keys, etc)**
- When fixing security/permissions issues, ONLY change grants/policies — never touch the data itself
- Always propose SQL as code for the user to review, never execute destructive SQL directly

## Environments

- Three environments, one-directional flow: local → staging → prod (see `ENVIRONMENTS.md`)
- `main` = production. Any other pushed branch = Vercel preview + staging Supabase
- No migration CI: migrations are applied by hand, to staging first, then to prod with the user's explicit OK, and each version is recorded in `supabase_migrations.schema_migrations` so a later `db push` won't re-run it
- Vercel Preview-scoped env vars point at the staging Supabase project; Production-scoped at prod
- Staging is disposable: reset with `supabase db reset --linked` while linked to staging. Never copy prod data into it

## Git

- Preserve full commit history on merge — NEVER squash PRs (use a merge commit or rebase, keep every commit)
- Commit message format (ALWAYS follow):
  - emoji + conventional commit: `✨ feat(scope): ...`, `🐛 fix(scope): ...`, `✏️ docs: ...`, `♻️ refactor: ...`
  - single line only — no body, no bullet points
  - all lowercase, written in english
  - split work into separate commits by logical part / group of changes (never one giant commit)
- Never skip hooks or force push to main

## Third-party Assets (IMPORTANT)

- **Arcade character sprites (char_0-5)** and Lumon furniture: from [pixel-agents](https://github.com/pablodelucca/pixel-agents) by Pablo De Lucca (MIT) / [MetroCity](https://jik-a-4.itch.io/metrocity-free-topdown-character-pack) (CC0). These ARE in the repo under `public/sprites/arcade/`.
- **Cozy People Asset Pack** by shubibubi: purchased under commercial license ($3.99+). Used for the layered avatar (body, hair, clothing, accessories) and pet sprites.
- **Cozy Interior Asset Pack** by shubibubi: purchased under commercial license. Used for arcade room furniture and tilesets.
- **License terms**: "Can be used in any commercial or non commercial project, may modify. Can't be resold or redistributed even if modified."
- **NEVER commit Cozy assets to the repo** — they are NOT covered by AGPL. They live in Supabase Storage and are loaded at runtime via `NEXT_PUBLIC_COZY_BASE_URL`.
- **NEVER include Cozy PNGs in git add** — the `public/cozy/` folder is gitignored.
- Forkers must buy their own license from shubibubi on itch.io and place files in `public/cozy/`, then seed the `arcade-assets` Supabase bucket from those files. (The maintainer's upload script lives under the gitignored `scripts/` folder and is not shipped — write a small one-off uploader against the `arcade-assets` bucket.)
- Original purchase links: https://shubibubi.itch.io/cozy-people and https://shubibubi.itch.io/cozy-interior
- **Kenney models** (`public/models/trees/*.glb`, `public/models/props/*.glb`): from [Kenney](https://kenney.nl) Nature Kit / City Kit (CC0 — public domain). Free to use, modify, and redistribute; attribution appreciated but not required. These ARE in the repo. Raw unpacked kit folders stay local (`kenney/` is gitignored).
- **Kenney Racing Kit, Nature Kit and City Kit (Industrial)** (`public/models/drift/**`): the drift spots' grandstands, pits, tents, light posts, flags, trees, rocks, containers and tanks, from [Kenney](https://kenney.nl) (CC0). These ARE in the repo; only the models the spots use are copied.
- **Kenney Car Kit** (`public/models/cars/*.glb`): the sedan body and a wheel from [Kenney](https://kenney.nl/assets/car-kit) Car Kit (CC0). These ARE in the repo.
- **Drive sounds** (`public/sounds/drive/*.ogg`): `engine`, `skid` and `impact` from [KenneyNL/Starter-Kit-Racing](https://github.com/KenneyNL/Starter-Kit-Racing) (CC0; the skid sound is by Landeplage, also CC0). The horn is synthesized in code, no file.
- **San Francisco and Bay Area maps** (`public/maps/sf.json`, `public/maps/bay.json`, `src/lib/maps/bay-lots.json`): baked from [OpenStreetMap](https://www.openstreetmap.org/copyright) data (the Bay from a Geofabrik extract). OSM data is **ODbL** — the "© OpenStreetMap contributors" credit MUST stay visible on the map (rendered in `home-client.tsx`). The committed files are what ship; the bake scripts live under the gitignored `scripts/` folder and are not in the repo.

- **Brazil's cities** (`src/lib/towns/br-cities.json`): the 5,571 municipalities with their IBGE codes and seats, from [kelvins/municipios-brasileiros](https://github.com/kelvins/municipios-brasileiros) (MIT, compiled from IBGE).
- **Brazil map** (`src/lib/towns/brasil-geo.json`, `src/lib/towns/brasil-rivers.json`): the outline and states simplified from [IBGE](https://www.ibge.gov.br/geociencias/organizacao-do-territorio/malhas-territoriais.html) meshes (public data, credit IBGE), the rivers from [Natural Earth](https://www.naturalearthdata.com) (public domain). The "Map data: IBGE · Natural Earth" credit stays on the Brasil map (`brasil-town.tsx`).

## Key files

| File | What it does |
|------|-------------|
| `src/components/InstancedBuildings.tsx` | WebGL instanced rendering for thousands of buildings |
| `src/components/CityCanvas.tsx` | Main Three.js scene setup |
| `src/lib/raid.ts` | Raid system (PvP, scoring, limits) |
| `src/lib/items.ts` | Shop items, equipping, zones |
| `src/lib/xp.ts` | XP leveling (25 levels, 6 tiers) |
| `src/lib/pixels.ts` | PX earning (`earn_pixels` rules) and balances |
