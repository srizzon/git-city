-- 118_fix_referral_source.sql
-- The 'referral' earn rule (105) writes source 'social', which the
-- wallet_transactions check (110) never allowed, so every referral payout
-- failed silently. Re-add the check with 'social' and 'league_reward'.

BEGIN;

ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_source_check;
ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_source_check
  CHECK (source IN (
    'purchase',
    'daily_commit',
    'streak_bonus',
    'achievement',
    'city_action',
    'item_purchase',
    'refund',
    'chargeback',
    'adjustment',
    'event_reward',
    'social',
    'league_reward'
  ));

COMMIT;
