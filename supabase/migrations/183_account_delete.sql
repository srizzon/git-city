-- Account deletion in one transaction (/api/account/delete and /admin/accounts).
-- The route used to empty 25 tables one call at a time, and the PX ledger's
-- immutable trigger stopped it at wallet_transactions: anyone who had earned PX
-- got "Couldn't delete your account" with half their data already gone.
-- Now every foreign key to developers cascades (or sets null where the row is
-- someone else's), the ledger lets a delete through only inside an account
-- erasure, and delete_developer_account() removes everything or nothing.
-- New tables that point at developers must use ON DELETE CASCADE / SET NULL.

-- 1. Foreign keys that blocked the delete. Constraint names differ between
-- prod and staging, so each one is found by its table and column.
DO $$
DECLARE
  fk record;
  old_name text;
BEGIN
  FOR fk IN
    SELECT * FROM (VALUES
      ('activity_feed', 'actor_id', 'developers', 'CASCADE'),
      ('activity_feed', 'target_id', 'developers', 'CASCADE'),
      ('xp_log', 'developer_id', 'developers', 'CASCADE'),
      ('daily_mission_progress', 'developer_id', 'developers', 'CASCADE'),
      ('fly_scores', 'developer_id', 'developers', 'CASCADE'),
      ('streak_freeze_log', 'developer_id', 'developers', 'CASCADE'),
      ('streak_checkins', 'developer_id', 'developers', 'CASCADE'),
      ('streak_rewards', 'developer_id', 'developers', 'CASCADE'),
      ('developer_kudos', 'giver_id', 'developers', 'CASCADE'),
      ('developer_kudos', 'receiver_id', 'developers', 'CASCADE'),
      ('building_visits', 'visitor_id', 'developers', 'CASCADE'),
      ('building_visits', 'building_id', 'developers', 'CASCADE'),
      ('developer_achievements', 'developer_id', 'developers', 'CASCADE'),
      ('developer_customizations', 'developer_id', 'developers', 'CASCADE'),
      ('survey_responses', 'developer_id', 'developers', 'CASCADE'),
      ('district_changes', 'developer_id', 'developers', 'CASCADE'),
      ('districts', 'mayor_id', 'developers', 'SET NULL'),
      ('purchases', 'developer_id', 'developers', 'CASCADE'),
      ('purchases', 'gifted_to', 'developers', 'SET NULL'),
      ('pixel_gitc_payments', 'developer_id', 'developers', 'CASCADE'),
      ('pixel_purchases', 'developer_id', 'developers', 'CASCADE'),
      ('wallet_transactions', 'developer_id', 'developers', 'CASCADE'),
      ('wallets', 'developer_id', 'developers', 'CASCADE'),
      ('raid_tags', 'attacker_id', 'developers', 'CASCADE'),
      ('raid_tags', 'building_id', 'developers', 'CASCADE'),
      ('raids', 'attacker_id', 'developers', 'CASCADE'),
      ('raids', 'defender_id', 'developers', 'CASCADE')
    ) AS t(tbl, col, ref, action)
  LOOP
    SELECT c.conname INTO old_name
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND c.conrelid = format('public.%I', fk.tbl)::regclass
      AND c.confrelid = format('public.%I', fk.ref)::regclass
      AND a.attname = fk.col;
    IF old_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', fk.tbl, old_name);
    END IF;
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.%I(id) ON DELETE %s',
      fk.tbl, fk.tbl || '_' || fk.col || '_fkey', fk.col, fk.ref, fk.action
    );
  END LOOP;
END $$;

-- An arcade room goes with its owner's login.
DO $$
DECLARE
  old_name text;
BEGIN
  SELECT c.conname INTO old_name
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
  WHERE c.contype = 'f' AND c.conrelid = 'public.arcade_rooms'::regclass
    AND c.confrelid = 'auth.users'::regclass AND a.attname = 'owner_id';
  IF old_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.arcade_rooms DROP CONSTRAINT %I', old_name);
  END IF;
  ALTER TABLE public.arcade_rooms ADD CONSTRAINT arcade_rooms_owner_id_fkey
    FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;
END $$;

-- 2. The ledger stays immutable, except for a delete inside an account erasure.
CREATE OR REPLACE FUNCTION public.prevent_ledger_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('gitcity.erasing_account', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Ledger entries are immutable. Create a reversal instead.';
END;
$$;

-- 3. Everything a developer left, in one go. Rows that only point at them
-- (comments, job alerts, ad events) go too; their lot, towns and game events
-- stay with the pointer set null. The auth user is deleted by the caller.
CREATE OR REPLACE FUNCTION public.delete_developer_account(p_developer_id bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  dev_login text;
BEGIN
  SELECT github_login INTO dev_login FROM developers WHERE id = p_developer_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  PERFORM set_config('gitcity.erasing_account', 'on', true);
  DELETE FROM brasil_comments WHERE developer_id = p_developer_id;
  DELETE FROM job_alert_subscriptions WHERE developer_id = p_developer_id;
  DELETE FROM sky_ad_events WHERE lower(github_login) = lower(dev_login);
  DELETE FROM developers WHERE id = p_developer_id;
  PERFORM set_config('gitcity.erasing_account', 'off', true);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_developer_account(bigint) FROM PUBLIC, anon, authenticated;
