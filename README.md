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

## Local Supabase (no remote project needed)

You can run the whole backend locally — no Supabase account, no GitHub OAuth app.

**Prerequisites:** a container runtime and the Supabase CLI.

```bash
# macOS (Colima is a lightweight, free Docker alternative)
brew install colima docker supabase/tap/supabase
colima start

# ...or use Docker Desktop instead of Colima, then just:
# brew install supabase/tap/supabase
```

**Start the stack** (spins up Postgres/Auth/Storage/Studio and applies every
migration from scratch):

```bash
supabase start          # first run pulls images; prints your local URL + keys
supabase status         # re-print the URL and keys at any time
```

Point `.env.local` at the printed local values:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<Publishable key from `supabase status`>
SUPABASE_SERVICE_ROLE_KEY=<Secret key from `supabase status`>
```

Then `npm run dev`. The city renders straight from your local database — no
snapshot step needed in local dev.

**Logging in (zero config):** the GitHub OAuth provider isn't configured for a
local stack (it needs a client secret that can't ship in the repo). Instead,
clicking **Sign in with GitHub** locally takes you to a built-in dev login —
type any GitHub username and you're in, with a building created from that
account. You can also go straight to
[http://localhost:3001/api/dev/login](http://localhost:3001/api/dev/login).
This route is automatically disabled in production.

Useful commands:

```bash
supabase db reset       # re-apply all migrations on a clean database
supabase stop           # shut the stack down (data is preserved)
```

Studio (DB browser) runs at [http://127.0.0.1:54323](http://127.0.0.1:54323).

## Environment Setup

After copying `.env.example` to `.env.local`, fill in these values:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `GITHUB_TOKEN`
- `ADMIN_GITHUB_LOGINS` if you want access to `/admin/ads`

### Where to find the Supabase values

Open your Supabase project dashboard, then go to `Project Settings -> API`.

- `NEXT_PUBLIC_SUPABASE_URL`: your project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: the public anon key
- `SUPABASE_SERVICE_ROLE_KEY`: the service role key for server-side admin access

For local GitHub login to work, you also need to configure the GitHub OAuth provider in Supabase and add your local callback URL if required by your setup.

### Where to find the GitHub token

Open GitHub and go to `Settings -> Developer settings -> Personal access tokens`.

- Fine-grained tokens are recommended if you only want to grant the minimum repository/profile access this app needs.
- Classic tokens also work if that fits your setup better.

Create a token, copy it once, and place it in `GITHUB_TOKEN` inside `.env.local`.

## License

[AGPL-3.0](LICENSE) — You can use and modify Git City, but any public deployment must share the source code.

---

<p align="center">
  Built by <a href="https://x.com/samuelrizzondev">@samuelrizzondev</a>
</p>
