# Security Policy

## Supported Versions

Git City is actively developed. Security fixes are applied to the latest version on `main`.

| Version | Supported          |
| ------- | ------------------ |
| latest (`main`) | :white_check_mark: |
| older commits   | :x:                |

## Reporting a Vulnerability

We take security seriously. If you discover a vulnerability in Git City, please **do not** open a public GitHub issue.

### How to Report

Please report vulnerabilities by emailing the maintainer directly or using GitHub's private security advisory feature:

1. Go to the [Security Advisories](https://github.com/srizzon/git-city/security/advisories) page
2. Click **"Report a vulnerability"**
3. Fill in the details of the issue

Alternatively, you can reach out to the maintainer via [X/Twitter](https://x.com/samuelrizzondev).

### What to Include

Please include as much of the following information as possible to help us understand and resolve the issue quickly:

- A description of the vulnerability and its potential impact
- Steps to reproduce the issue
- Any proof-of-concept or exploit code (if applicable)
- Affected component(s) (e.g., auth flow, API route, Supabase RLS policy)

## Sensitive Areas

Git City handles the following sensitive data — please pay special attention when auditing:

- **GitHub OAuth tokens** — used for authentication via Supabase
- **Supabase Row Level Security (RLS)** — controls data access per user
- **Stripe payment webhooks** — handles payment events
- **API routes** — under `src/app/api/` — ensure proper authentication checks
- **CRON endpoints** — protected by `CRON_SECRET`; unauthorized access could trigger unintended server actions

## Response Timeline

- **Acknowledgement:** Within 72 hours of receiving a report
- **Status update:** Within 7 days
- **Fix or mitigation:** Depends on severity; critical issues will be prioritized

## Disclosure Policy

We follow a **coordinated disclosure** model. Once a fix is available, we will:

1. Publish a GitHub Security Advisory
2. Credit the reporter (unless they wish to remain anonymous)
3. Release a patched version

Thank you for helping keep Git City and its users safe!
