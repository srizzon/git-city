# Git City

3D pixel art city built from real GitHub data. Buildings represent developers: height = contributions, width = repos, lit windows = recent activity.

## Tech stack

- **Frontend:** Next.js App Router, Three.js (instanced rendering), TypeScript
- **Backend:** Supabase (Postgres + Auth + Realtime)
- **Payments:** Stripe (USD), AbacatePay (BRL/PIX), NOWPayments (crypto)
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

## Git

- Squash and merge for PRs
- Conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`
- Never skip hooks or force push to main

## Third-party Assets (IMPORTANT)

- **Arcade character sprites (char_0-5)**: from [pixel-agents](https://github.com/pablodelucca/pixel-agents) by Pablo De Lucca (MIT) / [MetroCity](https://jik-a-4.itch.io/metrocity-free-topdown-character-pack) (CC0). These ARE in the repo.
- **Cozy People Asset Pack** by shubibubi: purchased under commercial license ($3.99+). Used for avatar customization (layered body, hair, clothing, accessories).
- **Cozy Interior Asset Pack** by shubibubi: purchased under commercial license. Used for arcade room furniture.
- **License terms**: "Can be used in any commercial or non commercial project, may modify. Can't be resold or redistributed even if modified."
- **NEVER commit Cozy assets to the repo** — they are NOT covered by AGPL. They live in Supabase Storage and are loaded at runtime.
- **NEVER include Cozy PNGs in git add** — the `/public/cozy-paid/` folder is gitignored.
- If someone forks the repo, they need to buy their own license from shubibubi on itch.io.
- Original purchase link: https://shubibubi.itch.io/cozy-people

## Key files

| File | What it does |
|------|-------------|
| `src/components/InstancedBuildings.tsx` | WebGL instanced rendering for thousands of buildings |
| `src/components/CityCanvas.tsx` | Main Three.js scene setup |
| `src/lib/raid.ts` | Raid system (PvP, scoring, limits) |
| `src/lib/items.ts` | Shop items, equipping, zones |
| `src/lib/xp.ts` | XP leveling (25 levels, 6 tiers) |
| `src/lib/stripe.ts` | Stripe checkout sessions |
| `src/app/api/webhooks/stripe/route.ts` | Stripe webhook handler |
