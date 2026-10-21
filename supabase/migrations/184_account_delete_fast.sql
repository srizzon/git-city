-- delete_developer_account (183) hit the 8s statement timeout on prod: its
-- lower(github_login) on sky_ad_events (260 MB) skipped the login index, and
-- cascades scanned child tables with no index on their developer column.
-- Logins are stored lowercase everywhere, so it matches them as they are,
-- and every foreign key column to developers gets an index.

DO $$
DECLARE
  fk record;
BEGIN
  FOR fk IN
    SELECT c.conrelid::regclass::text AS tbl, a.attname AS col
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND c.confrelid = 'public.developers'::regclass
      AND NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = c.conrelid AND i.indkey[0] = c.conkey[1])
  LOOP
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s (%I)', 'idx_' || replace(fk.tbl, 'public.', '') || '_' || fk.col, fk.tbl, fk.col);
  END LOOP;
END $$;

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
  DELETE FROM sky_ad_events WHERE github_login = dev_login;
  DELETE FROM developers WHERE id = p_developer_id;
  PERFORM set_config('gitcity.erasing_account', 'off', true);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_developer_account(bigint) FROM PUBLIC, anon, authenticated;
