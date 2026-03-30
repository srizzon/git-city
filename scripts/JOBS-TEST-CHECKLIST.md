# Jobs Test Checklist

## Setup

```bash
# 1. Run migration (creates job_alert_subscriptions table)
npx supabase db push

# 2. Seed test data (7 active + 1 pending listing)
# Paste scripts/seed-jobs-test.sql into Supabase SQL Editor
# Or: psql $DATABASE_URL -f scripts/seed-jobs-test.sql

# 3. Make sure your GitHub login is in ADMIN_GITHUB_LOGINS in .env.local

# 4. Start dev server
npm run dev
```

---

## Test 1: Public Board (no login)

Open an incognito window (no cookies).

- [ ] `localhost:3001/jobs` → shows all 7 active listings with filters
- [ ] Header shows "Sign in with GitHub" button (not My Applications/Profile)
- [ ] Search "react" → filters results
- [ ] Click a job card → goes to `/jobs/[id]` detail page
- [ ] Detail page shows full description, salary, company, benefits
- [ ] Apply button says "Sign in to Apply" with GitHub redirect
- [ ] View page source → find `application/ld+json` script with JobPosting schema
- [ ] Premium listing (Pixel Labs fullstack) has gold border
- [ ] Featured listing (Acme React) has lime border
- [ ] Job alert signup form visible at bottom of board

## Test 2: Programmatic Pages (SEO)

Still in incognito:

- [ ] `localhost:3001/jobs/t/react` → shows React jobs, title says "React"
- [ ] URL stays at `/jobs/t/react` (does NOT redirect to `/jobs`)
- [ ] Back link says "← All Jobs" (not "← Back to City")
- [ ] `localhost:3001/jobs/t/remote` → shows Remote jobs
- [ ] `localhost:3001/jobs/t/senior` → shows Senior jobs
- [ ] `localhost:3001/jobs/t/frontend` → shows Frontend jobs
- [ ] `localhost:3001/jobs/t/solidity` → shows Solidity job (web3)
- [ ] `localhost:3001/jobs/t/nonexistent` → 404

## Test 3: Job Alert Signup (public)

In incognito:

- [ ] Scroll to bottom of `/jobs` → see "Get job alerts" form
- [ ] Enter email + "react, typescript" → click Subscribe
- [ ] Shows "You're subscribed!" confirmation
- [ ] Check DB: `SELECT * FROM job_alert_subscriptions` → row exists

## Test 4: Public Feed

- [ ] `localhost:3001/api/jobs/feed` → XML feed with all active jobs
- [ ] `localhost:3001/api/jobs/feed?format=json` → JSON with all jobs
- [ ] Both have salary, company, tech_stack, seniority info

## Test 5: Developer Flow (logged in)

Log in with your GitHub account.

- [ ] `/jobs` → shows board with "My Applications" and "My Profile" links
- [ ] Click a job → detail page shows "Apply Now" button (not "Sign in")
- [ ] Below apply: "Complete your career profile to stand out" (if no profile)
- [ ] Click "Apply Now" → opens external URL in new tab
- [ ] Button changes to "You applied to this job"
- [ ] "Open application page again" link appears
- [ ] `/jobs/my-applications` → shows the application

## Test 6: Career Profile

- [ ] `/hire/edit` → career profile form
- [ ] Fill: bio, skills (react, typescript), seniority, salary range
- [ ] Toggle "Open to work" on
- [ ] Save → success
- [ ] Go back to a job detail → "Complete your career profile" message is gone

## Test 7: Admin Panel

Log in with your admin GitHub account.

- [ ] `/admin/jobs` → shows listings tab with all 8 listings
- [ ] "Pending" filter → shows 1 listing (Data Engineer)
- [ ] Click "Approve" on pending listing → status changes to active
- [ ] Check `/jobs` → Data Engineer now appears
- [ ] Go back to admin → try "Reject" on another (or create a new pending)
- [ ] Companies tab → shows 3 companies (Acme, Nova, Pixel)
- [ ] Create new company from admin panel
- [ ] Edit existing company name/slug
- [ ] Delete company without active listings

## Test 8: Company Dashboard

You need an advertiser account. Two options:

**Option A: Admin-link**
1. In admin panel → Companies tab → pick a company
2. Click "Link advertiser" → enter your test email
3. Go to `/business/login` → enter that email → check logs for magic link

**Option B: Direct flow**
1. `/for-companies` → click "Post a job"
2. `/business/login` → enter email → verify magic link
3. Create company profile
4. Dashboard should load

Once logged in as advertiser:

- [ ] `/jobs/dashboard` → shows company listings
- [ ] Click "Post a Job" → form loads
- [ ] Fill all required fields → save as draft
- [ ] Choose "Free" tier → auto-activates to pending_review
- [ ] Admin approves → listing goes live
- [ ] Back in dashboard → see listing metrics (views, applies)
- [ ] Candidates tab → see any devs who applied (with quality scores)
- [ ] Analytics tab → shows performance charts

## Test 9: Cron Jobs (manual trigger)

Use curl with your CRON_SECRET:

```bash
SECRET=your_cron_secret_here

# Weekly digest (devs with career profiles)
curl -H "Authorization: Bearer $SECRET" localhost:3001/api/cron/jobs-weekly-digest

# Public digest (email subscribers)
curl -H "Authorization: Bearer $SECRET" localhost:3001/api/cron/jobs-public-digest

# Expiry checker
curl -H "Authorization: Bearer $SECRET" localhost:3001/api/cron/jobs-expiry

# Notify signups (one-shot)
curl -H "Authorization: Bearer $SECRET" localhost:3001/api/cron/jobs-notify-signups

# Flush application emails (batched)
curl -H "Authorization: Bearer $SECRET" localhost:3001/api/cron/jobs-flush-application-emails
```

- [ ] Weekly digest returns `{ ok: true, sent: X }` (X > 0 if you have open_to_work profile)
- [ ] Public digest returns `{ ok: true }` (sent > 0 if alert subscriptions exist)
- [ ] Expiry returns `{ ok: true }`
- [ ] All return 401 without the secret

## Test 10: Edge Cases

- [ ] Apply to same job twice → still shows "You applied" (no duplicate)
- [ ] View expired/filled listing as applicant → shows with "closed" banner
- [ ] View expired listing as random user → 404
- [ ] Report a listing → confirmation appears
- [ ] Premium job always appears above standard/free in list
- [ ] Pagination works (if >20 listings)

## Cleanup

```sql
-- Remove seed data when done
DELETE FROM job_listings WHERE id LIKE '22222222%';
DELETE FROM job_company_profiles WHERE id LIKE '11111111%';
DELETE FROM job_alert_subscriptions WHERE email = 'your-test@email.com';
```
