# Git City Pro Plan

**Status:** Approved
**Created:** 2026-03-16
**Priority:** High

## Overview

Subscription plan ($2.99/mo launch, $4.99/mo post-E.Arcade) that expands gameplay limits, adds visual identity perks, and gates multiplayer (E.Arcade) behind Pro. Not pay-to-win. Focused on generating predictable MRR.

## Decisions

- Traditional Pro plan with perks across the whole game (not zone-based like Offshore)
- Focus on MRR as primary goal
- $2.99/mo at launch (early adopter pricing), $4.99/mo when E.Arcade launches
- Monthly billing only at launch, annual plan later
- No pay-to-win: expands limits and content, does not make players stronger
- Target: both grinders (more raids/kudos) and casuals (visual status)
- E.Arcade (multiplayer) is 100% Pro-only, with 3 free lifetime entries for everyone
- Stripe only for subscriptions (no AbacatePay/NOWPayments for recurring billing)

## Free vs Pro

| Feature | Free | Pro |
|---|---|---|
| **Price** | $0 | $2.99/mo (launch) / $4.99/mo (post-E.Arcade) |
| **Raids** | 3/day | 5/day |
| **Kudos** | 5/day | 10/day |
| **Pro cosmetics** | Can see, can't equip | 2-3 exclusive auras/effects |
| **Badge** | - | "Pro" badge on building card |
| **Building glow** | - | Gold border/outline visible in city |
| **Card highlight** | - | Premium visual when others visit your building |
| **E.Arcade** | 3 entries lifetime | Unlimited access |

## E.Arcade Access

- Multiplayer has real infrastructure cost (PartyKit/WebSocket connections)
- Free players get 3 lifetime entries to experience it, then it's Pro-only
- Free entries are consumed permanently (no reset, no refund if player subscribes later)
- If player had Pro, canceled, and used entries during Pro period, those don't count against the 3 free ones
- Tracked via `arcade_free_entries` column on developers table

## Visual Identity

### Badge
- Small icon next to username on building card (shield or star with "PRO")
- Gold/yellow color
- Appears everywhere the username shows: raid log, kudos, leaderboards, activity feed

### Building Glow
- Subtle gold border/outline on the building in the 3D city
- Distinct from shop auras (auras = effects around building, glow = border on the building itself)
- Visible from a distance to create "what's that building?" curiosity

### Card Highlight
- When someone visits a Pro building, the card has a subtle premium visual (gradient background, gold border, or different header color)
- Understated, not flashy

### Pro-Only Cosmetics
- 2-3 auras/effects at launch that only Pro can equip
- Shown in shop with "PRO" tag, free players can see them but not buy/equip
- Creates in-game marketing: "I want that effect" -> subscribe
- Rotate/add new ones every 1-2 months to keep freshness

## Home Screen Presence

- **Building glow in city**: Pro buildings glow gold, visible to all players. Passive marketing, no UI needed
- **HUD button**: Small "✦" icon in corner of HUD, opens Pro panel with perks and subscribe/manage CTA
- No aggressive popups or paywalls mid-action

### Contextual Nudges
- When player hits a limit (3/3 raids), show subtle banner: "Want more? Go Pro"
- E.Arcade card shows "Pro members only" + online player count
- Profile page has "Pro" section (status, manage subscription, or upgrade CTA)

## Edge Cases

### Subscribes mid-day
- Player already used 3 raids today, subscribes at 15h
- Gets the 2 extra raids immediately (don't wait for next day)

### Subscription expires with Pro cosmetic equipped
- Cosmetic is auto-unequipped
- Item stays in inventory but greyed out with "Pro required" badge
- Player doesn't lose the item, just can't use it

### E.Arcade: 3 free entries + subscribe and cancel
- Free entries already used are gone permanently
- Subscribing doesn't refund them
- During active Pro, entries are not consumed (unlimited access)

### Resubscribe after canceling
- Loses grandfather pricing. New price applies
- Incentivizes not canceling

### Cancellation flow
- `cancel_at_period_end = true`
- Player keeps Pro perks until end of billing cycle
- At cycle end: perks revoked, cosmetics unequipped, limits reset to free

### Payment failure (grace period)
- Status: `past_due` for 7 days
- Player keeps Pro perks during grace period
- In-app banner: "Payment failed. Update your card."
- Stripe Smart Retries attempts ~8 retries over 2 weeks
- If recovered: banner disappears, status back to `active`
- If not recovered after 7 days: status `canceled`, perks revoked

### Refund / Chargeback
- Pro deactivated immediately
- Cosmetics unequipped
- Same as cancellation but instant

### Gift Pro
- Not supported at launch. Evaluate later based on demand.

## Technical Architecture

### Database

**New table: `subscriptions`**
```sql
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id BIGINT NOT NULL REFERENCES developers(id) UNIQUE,
  stripe_subscription_id TEXT UNIQUE NOT NULL,
  stripe_customer_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  plan TEXT NOT NULL DEFAULT 'pro',
  price_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  cancel_at_period_end BOOLEAN DEFAULT false,
  grandfathered BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_stripe_sub_id
  ON subscriptions(stripe_subscription_id);
CREATE INDEX idx_subscriptions_status
  ON subscriptions(developer_id, status);
```

**New column on `developers`:**
```sql
ALTER TABLE developers
  ADD COLUMN arcade_free_entries INTEGER DEFAULT 3;
```

**Webhook idempotency table:**
```sql
CREATE TABLE webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Stripe Setup

- Create Product "Git City Pro" in Stripe Dashboard
- Price IDs stored in env vars: `STRIPE_PRO_MONTHLY_PRICE_ID`
- When price increases, create new Price in Stripe, update env var
- Existing subscribers stay on old price automatically (Stripe handles this)

### Checkout Flow

- Reuse existing `src/lib/stripe.ts` with `mode: 'subscription'`
- Metadata: `{ developer_id, github_login, plan: 'pro' }`
- Reuse existing currency detection (USD/BRL)
- Redirect to existing success/cancel URLs

### Webhook Events

Expand existing handler at `src/app/api/webhooks/stripe/route.ts`:

| Event | Action |
|---|---|
| `checkout.session.completed` (mode=subscription) | Create `subscriptions` row, activate perks |
| `customer.subscription.updated` | Update status, period_end. Handles active/past_due transitions |
| `invoice.paid` | Renew period_end, confirm active status |
| `invoice.payment_failed` | Mark `past_due`, send in-app notification |
| `customer.subscription.deleted` | Mark `canceled`, unequip Pro cosmetics, revoke perks |
| `charge.refunded` | Same as deleted: revoke everything |

All events check `webhook_events` table for idempotency before processing.

### Webhook Security

- Already has signature verification via `stripe.webhooks.constructEvent()` with raw body
- Add idempotency: check/insert `webhook_events` before processing
- Return 200 immediately (inline processing acceptable for Git City's volume)

### Pro Status Check

```typescript
async function getProStatus(developerId: string): Promise<{
  isPro: boolean
  isGracePeriod: boolean
  expiresAt: Date | null
}> {
  const sub = await db.subscriptions.findByDeveloperId(developerId)

  if (!sub) return { isPro: false, isGracePeriod: false, expiresAt: null }

  if (sub.status === 'active') {
    return { isPro: true, isGracePeriod: false, expiresAt: sub.current_period_end }
  }

  if (sub.status === 'past_due') {
    return { isPro: true, isGracePeriod: true, expiresAt: sub.current_period_end }
  }

  if (sub.status === 'canceled' && sub.current_period_end > new Date()) {
    return { isPro: true, isGracePeriod: false, expiresAt: sub.current_period_end }
  }

  return { isPro: false, isGracePeriod: false, expiresAt: null }
}
```

### Dynamic Limits

```typescript
const LIMITS = {
  raids: { free: 3, pro: 5 },
  kudos: { free: 5, pro: 10 },
} as const

function getLimit(type: keyof typeof LIMITS, isPro: boolean): number {
  return LIMITS[type][isPro ? 'pro' : 'free']
}
```

### API Routes

| Route | Method | Description |
|---|---|---|
| `/api/subscription` | GET | Current status (isPro, expiresAt, isGracePeriod) |
| `/api/subscription/checkout` | POST | Create Stripe checkout session (subscription mode) |
| `/api/subscription/portal` | POST | Redirect to Stripe Customer Portal (manage/cancel) |

### Subscription Management

- V1: Stripe Customer Portal for all billing management (cancel, update card, invoices)
- No custom billing UI needed at launch
- Future: custom UI if user feedback demands it

### Reconciliation (Safety Net)

Daily cron job:
1. Fetch all subscriptions where `status = 'active'` and `current_period_end < now - 1 day`
2. Verify status against Stripe API
3. Update DB if divergent

Catches any missed webhooks.

## Rollout Strategy

### Phase 1: Soft Launch (Week 1)
- Pro Plan available, no big announcement
- Price: $2.99/mo
- All perks except E.Arcade (shows "Coming soon - Pro members get access first")
- Goal: test billing flow with small user group, catch bugs

### Phase 2: Announcement (Week 2-3)
- Discord post, tweet, dev-log entry
- Early adopter messaging: "Lock in $2.99/mo forever. Price goes up when E.Arcade launches"
- Goal: first conversion wave

### Phase 3: E.Arcade Launch (when ready)
- Pro members get immediate unlimited access
- Free players get 3 lifetime entries
- Price increases to $4.99/mo for new subscribers
- Grandfathered users keep $2.99/mo
- Second big announcement: "Multiplayer is live"
- Early adopter cosmetic reward for Phase 1-2 subscribers (exclusive item, never available again)

## Metrics

| Metric | Target |
|---|---|
| Conversion rate (free -> pro) | 3-5% of active players |
| MRR | $100+ first month |
| Monthly churn | <10% |
| Grace period recovery | >50% of past_due |
