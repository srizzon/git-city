# Contributing to Git City

Thanks for your interest in contributing! Here's how to get started.

## Setup

```bash
git clone https://github.com/srizzon/git-city.git
cd git-city
npm install
cp .env.example .env.local
# Fill in your keys (see .env.example for details)
npm run dev
```

The app runs on [http://localhost:3001](http://localhost:3001).

## Requirements

- Node.js 18+
- A Supabase project (free tier works)
- A GitHub personal access token (for API calls)
- Stripe test keys (only if working on payments)

## Environment Variables

Copy `.env.example` to `.env.local` and fill in the values. Here is a summary of what each variable does:

| Variable | Required | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_BASE_URL` | Yes | Base URL for the app (e.g. `http://localhost:3001` locally) |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (server-side only, keep secret) |
| `GITHUB_TOKEN` | Yes | GitHub personal access token for API calls |
| `STRIPE_SECRET_KEY` | Optional | Stripe secret key — only needed for payment features |
| `STRIPE_WEBHOOK_SECRET` | Optional | Stripe webhook secret — only needed for payment features |
| `ABACATEPAY_API_KEY` | Optional | AbacatePay key — only needed for BRL payment support |
| `ABACATEPAY_WEBHOOK_SECRET` | Optional | AbacatePay webhook secret |
| `NEXT_PUBLIC_HIMETRICA_API_KEY` | Optional | Himetrica analytics key |
| `RESEND_API_KEY` | Optional | Resend email key — used for ad expiry notification emails |
| `CRON_SECRET` | Optional | Secret token to authenticate Vercel cron job requests |

> **Tip:** For local development you only need the Supabase, GitHub token, and base URL variables. Stripe, AbacatePay, Resend, and Himetrica keys are only required if you are actively working on those features.

## Code Style

- TypeScript everywhere
- Tailwind CSS v4 for styling
- Pixel font (Silkscreen) for UI text
- React Three Fiber (R3F) + drei for 3D
- App Router (Next.js 16)

Run `npm run format` and `npm run lint` before submitting.

## Making Changes

1. Fork the repo
2. Create a branch from `main` (`git checkout -b feat/my-feature`)
3. Make your changes
4. Run `npm run format` and `npm run lint`, then fix any issues
5. Commit with a clear message (e.g. `feat: add rain weather effect`)
6. Open a Pull Request against `main`

## Commit Messages

Start with an emoji + type. Single line, present tense, concise.

| Emoji | Type | When |
| --- | --- | --- |
| ✨ | `feat` | New features |
| 🐛 | `fix` | Bug fixes |
| 📦 | `refactor` | Code restructuring |
| ✏️ | `docs` | Documentation |
| 💄 | `style` | Formatting, renaming |
| 🚀 | `perf` | Performance |
| 🚧 | `chore` | Maintenance |
| 🧪 | `test` | Tests |
| 🌐 | `i18n` | Internationalization |
| 📈 | `analytics` | Analytics |
| 🗃️ | `database` | Database changes |
| 🔧 | `ci` | CI/CD |
| 🏗️ | `build` | Build changes |
| ⏪️ | `revert` | Reverting commits |

**Examples:**

```
✨ feat(popover): add popover component
🐛 fix(command): resolve input focus issue
📦 refactor(command): improve component structure
🚧 chore: update dependencies
```

## Good First Issues

Look for issues labeled [`good first issue`](https://github.com/srizzon/git-city/labels/good%20first%20issue). These are scoped tasks that don't require deep knowledge of the codebase.

## Project Structure

```
src/
  app/          # Next.js App Router pages and API routes
  components/   # React components (UI + 3D)
  lib/          # Utilities, Supabase clients, helpers
  types/        # TypeScript types
public/         # Static assets (audio, images)
supabase/       # Database migrations
```

## 3D / Three.js

The city is rendered with React Three Fiber. Key files:

- `src/components/CityScene.tsx` - Main 3D scene
- `src/components/Building.tsx` - Individual building rendering
- `src/lib/zones.ts` - Item definitions for building customization

If you're adding a new building effect or item, start with `zones.ts`.

## Troubleshooting

**`npm run dev` fails with a Supabase error**
Make sure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set correctly in `.env.local`.

**GitHub API rate limit errors**
Ensure `GITHUB_TOKEN` is a valid personal access token with at least `read:user` and `public_repo` scopes.

**Port 3001 already in use**
Kill the process using port 3001, or change `NEXT_PUBLIC_BASE_URL` and the dev server port in `package.json`.

**TypeScript errors after pulling latest changes**
Run `npm install` to pick up any new dependencies, then `npm run lint` to surface type issues.

## Questions?

Open an issue or reach out on [X/Twitter](https://x.com/samuelrizzondev).
