<h1 align="center">Git City</h1>

<p align="center">
  <strong>Your GitHub profile as a 3D pixel art building in an interactive city.</strong>
</p>

<p align="center">
  <a href="https://thegitcity.com">thegitcity.com</a>
</p>

<p align="center">
  <img src="public/og-image.png" alt="Git City — Where Code Builds Cities" width="800" />
</p>

---

## What is Git City?

Git City transforms every GitHub profile into a unique pixel art building. The more you contribute, the taller your building grows. Explore an interactive 3D city, fly between buildings, and discover developers from around the world.

## Features

- **3D Pixel Art Buildings** — Each GitHub user becomes a building with height based on contributions, width based on repos, and lit windows representing activity
- **Free Flight Mode** — Fly through the city with smooth camera controls, visit any building, and explore the skyline
- **Profile Pages** — Dedicated pages for each developer with stats, achievements, and top repositories
- **Achievement System** — Unlock achievements based on contributions, stars, repos, referrals, and more
- **Building Customization** — Claim your building and customize it with items from the shop (crowns, auras, roof effects, face decorations)
- **Social Features** — Send kudos, gift items to other developers, refer friends, and see a live activity feed
- **Compare Mode** — Put two developers side by side and compare their buildings and stats
- **Share Cards** — Download shareable image cards of your profile in landscape or stories format

<!-- TODO: Add screenshots -->
<!-- ![City Overview](assets/screenshot-city.png) -->
<!-- ![Profile Page](assets/screenshot-profile.png) -->
<!-- ![Compare Mode](assets/screenshot-compare.png) -->

## How Buildings Work

| Metric         | Affects           | Example                                |
|----------------|-------------------|----------------------------------------|
| Contributions  | Building height   | 1,000 commits → taller building        |
| Public repos   | Building width    | More repos → wider base                |
| Stars          | Window brightness | More stars → more lit windows           |
| Activity       | Window pattern    | Recent activity → distinct glow pattern |

Buildings are rendered with instanced meshes and a LOD (Level of Detail) system for performance. Close buildings show full detail with animated windows; distant buildings use simplified geometry.

## Tech Stack

- **Framework:** [Next.js](https://nextjs.org) 16 (App Router, Turbopack)
- **3D Engine:** [Three.js](https://threejs.org) via [@react-three/fiber](https://github.com/pmndrs/react-three-fiber) + [drei](https://github.com/pmndrs/drei)
- **Database & Auth:** [Supabase](https://supabase.com) (PostgreSQL, GitHub OAuth, Row Level Security)
- **Payments:** [Stripe](https://stripe.com)
- **Styling:** [Tailwind CSS](https://tailwindcss.com) v4 with pixel font (Silkscreen)
- **Hosting:** [Vercel](https://vercel.com)

## Getting Started

```bash
# Clone the repo
git clone https://github.com/srizzon/git-city.git
cd git-city

# Install dependencies
npm install

# Set up environment variables

# Linux / macOS
cp .env.example .env.local

# Windows (Command Prompt)
copy .env.example .env.local

# Windows (PowerShell)
Copy-Item .env.example .env.local

# Fill in your environment variables

# Run the dev server
npm run dev
```

Open [http://localhost:3001](http://localhost:3001) to see the city.

## Environment Setup

After copying `.env.example` to `.env.local`, fill in these values:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `GITHUB_TOKEN`
- `ADMIN_GITHUB_LOGINS` if you want access to `/admin/ads`

### Where to find the Supabase values

Open your Supabase project dashboard, then go to `Project Settings -> API`.

- `NEXT_PUBLIC_SUPABASE_URL`: your project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: the public anon key
- `SUPABASE_SERVICE_ROLE_KEY`: the service-role/secret server key for admin access

Do not put the publishable or anon key into `SUPABASE_SERVICE_ROLE_KEY`. If that variable contains a publishable key, server scripts like seeding will hit Row Level Security errors instead of bypassing them.

For local GitHub login to work, you also need to configure the GitHub OAuth provider in Supabase and add your local callback URL if required by your setup.

### Where to find the GitHub token

Open GitHub and go to `Settings -> Developer settings -> Personal access tokens`.

- Fine-grained tokens are recommended if you only want to grant the minimum repository/profile access this app needs.
- Classic tokens also work if that fits your setup better.

Create a token, copy it once, and place it in `GITHUB_TOKEN` inside `.env.local`.

## Database Setup

This repository contains the database schema as SQL migrations in `supabase/migrations`. Those files create the tables, policies, RPCs, and some reference data used by the app.

### 1. Create the tables

Use one of these approaches:

- `Supabase Dashboard`: open `SQL Editor` and run the migration files from `supabase/migrations` in filename order, starting with `001_initial_schema.sql`.
- `Supabase CLI`: if you use the CLI locally, link your project and push the migrations from this repository.

Windows PowerShell example with the CLI:

```powershell
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

Linux / macOS example with the CLI:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

If you do not want to use the CLI, the manual SQL Editor route also works. The important part is that the migration files are applied in order.

### 2. Seed developer data

After the schema is in place, you can seed the `developers` table with the curated GitHub accounts from `scripts/seed.ts`.

Required env vars:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GITHUB_TOKEN`

Windows PowerShell example:

```powershell
$env:NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
$env:GITHUB_TOKEN="your-github-token"
npx tsx scripts/seed.ts
```

Linux / macOS example:

```bash
export NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
export GITHUB_TOKEN="your-github-token"
npx tsx scripts/seed.ts
```

If you already have a filled `.env.local`, you can also load those variables into the current shell session first and then run the seed.

Windows PowerShell:

```powershell
Get-Content .env.local | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
  $name, $value = $_ -split '=', 2
  [System.Environment]::SetEnvironmentVariable($name, $value, 'Process')
}

npx tsx scripts/seed.ts
```

Linux / macOS:

```bash
set -a
source .env.local
set +a

npx tsx scripts/seed.ts
```

The seed script fetches GitHub profile and repository data, upserts those developers into Supabase, and recalculates ranks at the end.

## License

[AGPL-3.0](LICENSE) — You can use and modify Git City, but any public deployment must share the source code.

---

<p align="center">
  Built by <a href="https://x.com/samuelrizzondev">@samuelrizzondev</a>
</p>
