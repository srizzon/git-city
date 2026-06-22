# Environments: local → staging → production

Git City runs in three environments. The flow is always one direction —
schema changes are born locally as migration files, ride a feature branch to
staging, and reach production when the branch merges into `main`. Never edit
the schema through the Supabase dashboard (in any environment); everything
goes through migration files in `supabase/migrations/`.

```
feature/xyz ── git push ──▶  Vercel Preview   +  Supabase STAGING
     │                       (auto URL)          (CI: db push)
     │
     └─ merge into main ──▶  Vercel Production +  Supabase PROD
                             (thegitcity.com)     (CI: db push)
```

There is no `develop` branch and no required PRs. Pushing any branch other
than `main` is enough to get a full working preview backed by staging.

## Daily workflow (solo dev)

1. Branch off `main`, start the local stack: `supabase start` + `npm run dev`.
2. Schema change? Create a migration:
   - `supabase migration new my_feature` and write the SQL by hand, or
   - edit through the local Studio and snapshot it: `supabase db diff -f my_feature`.
   - Verify it applies cleanly from scratch: `npm run db:reset`.
3. `git push` the branch. Two things happen automatically:
   - **GitHub Actions** (`deploy-staging-migrations.yml`) validates every
     migration from scratch and pushes pending ones to the staging project.
   - **Vercel** builds a preview deployment whose Preview-scoped env vars
     point at staging. Share that URL with anyone for testing.
4. Happy with it? Merge into `main` (no PR needed):
   `git checkout main && git merge feature/xyz && git push`.
   The existing `deploy-migrations.yml` workflow pushes the migrations to
   prod, and Vercel deploys production.

### Migration etiquette

- Never modify a migration that has already been pushed (to staging or prod).
  Fix forward with a new migration.
- Numbering is sequential (`108_`, `109_`, ...). If two branches grab the same
  number, rename before merging — `supabase db push` applies in filename order.
- Abandoned a branch after its migration hit staging? Reset staging (below).

## Resetting staging

Staging is shared by all branches, so it can drift (orphaned migrations from
abandoned branches, test data garbage). To rebuild it from `main`:

```sh
supabase link --project-ref jqdvuwlgczhcyzuiwofh
supabase db reset --linked   # drops everything, reapplies all migrations + seed.sql
supabase link --project-ref kxuhnbmureteruqbiubi   # re-link back to prod when done
```

This is always safe — staging holds no real user data, only `seed.sql` fakes.
**Never copy production data into staging** (user emails, advertiser API
keys, etc.).

## One-time setup

### 1. Create the staging Supabase project

- [supabase.com/dashboard](https://supabase.com/dashboard) → New project →
  name it `git-city-staging`, same region as prod, Free tier is fine.
- Save the database password — it becomes a GitHub secret below.
- Grab the project ref (Settings → General → Project ID).
- Free-tier note: the project pauses after ~1 week of inactivity; unpause it
  from the dashboard when that happens.

### 2. GitHub repo secrets

Settings → Secrets and variables → Actions → New repository secret:

| Secret | Value |
|---|---|
| `SUPABASE_STAGING_PROJECT_ID` | staging project ref |
| `SUPABASE_STAGING_DB_PASSWORD` | staging database password |

(`SUPABASE_ACCESS_TOKEN` already exists and is shared with the prod workflow.)

### 3. Seed staging with the existing migrations

Actions tab → "Deploy migrations to staging" → Run workflow (pick any
branch). It applies all migrations from scratch. Alternatively, locally:
`supabase link --project-ref jqdvuwlgczhcyzuiwofh && supabase db push`.

### 4. GitHub OAuth app for staging

Supabase Auth's GitHub provider needs its own OAuth app per project:

- GitHub → Settings → Developer settings → OAuth Apps → New OAuth App.
- Homepage URL: `https://thegitcity.com` (cosmetic).
- Authorization callback URL: `https://jqdvuwlgczhcyzuiwofh.supabase.co/auth/v1/callback`.
- In the staging Supabase dashboard: Authentication → Sign In / Up → GitHub →
  paste the new client ID/secret.

### 5. Staging auth redirect URLs

Staging dashboard → Authentication → URL Configuration:

- Site URL: `http://localhost:3001` (or the team's main preview URL).
- Additional redirect URLs — wildcards cover every Vercel preview:
  - `https://git-city-git-*-<vercel-team>.vercel.app/**`
  - `http://localhost:3001/**`

### 6. Vercel Preview env vars

Vercel dashboard → git-city project → Settings → Environment Variables.
Add these scoped to **Preview** only (no branch filter — all branches):

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://jqdvuwlgczhcyzuiwofh.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | staging anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | staging service role key |
| `STRIPE_SECRET_KEY` | Stripe **test mode** key |
| `STRIPE_WEBHOOK_SECRET` | test mode webhook secret (or omit) |
| `NEXT_PUBLIC_COZY_BASE_URL` | prod bucket URL is fine (public, read-only) |
| `NEXT_PUBLIC_MODELS_BASE_URL` | prod bucket URL is fine (public, read-only) |

Everything not overridden in Preview falls through to the Production value,
so review anything that writes (payment keys, Resend, etc.) and decide
whether previews should use a test-mode equivalent or stay unset.

Storage assets: previews can read the prod public buckets (they are public
and read-only), so no re-upload is needed. To test *new* assets, seed the
staging buckets instead with `scripts/upload-arcade-assets.mjs` /
`scripts/upload-cosmetic-models.mjs` run against `.env.dev`, and point
the env vars at staging.

### 7. Local `.env.dev` (optional)

To run the app locally against the staging database (e.g. debugging
something a tester saw on a preview), copy `.env.example` to `.env.dev`,
fill in the staging values, then `npm run dev:staging`. Like all `.env*`
files it is gitignored.

## Known preview limitations

- **Vercel crons don't run on previews** — the 17 crons in `vercel.json`
  only fire on the production deployment. To test a cron against staging,
  call its endpoint manually with the `CRON_SECRET` header.
- **Payment webhooks point at prod** — Stripe/AbacatePay webhook endpoints
  are registered against the production URL. Test webhooks locally with
  `stripe listen --forward-to localhost:3001/api/webhooks/stripe`.
- **`NEXT_PUBLIC_BASE_URL` falls back to the prod URL** when unset, so flows
  that build absolute URLs (checkout redirects, magic links) will point at
  prod on previews. Set it manually for a specific branch in Vercel if a
  test needs it.
