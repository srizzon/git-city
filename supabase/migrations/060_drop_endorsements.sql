-- 060_drop_endorsements.sql
-- Remove endorsement system (revisit later with proper moderation)

-- Remove endorsement achievements
DELETE FROM developer_achievements WHERE achievement_id IN ('endorser', 'endorsed_10', 'endorsed_50');
DELETE FROM achievements WHERE id IN ('endorser', 'endorsed_10', 'endorsed_50');

-- Drop table (cascades indexes, policies, triggers)
DROP TABLE IF EXISTS portfolio_endorsements CASCADE;

-- Drop enums
DROP TYPE IF EXISTS endorsement_status;
DROP TYPE IF EXISTS endorsement_relationship;

-- Drop RPC
DROP FUNCTION IF EXISTS get_endorsements_given_this_month(bigint);
