-- RPC: find auth user by github login (used for auto-claim on dev upsert)
CREATE OR REPLACE FUNCTION find_auth_user_by_github_login(p_github_login text)
RETURNS TABLE(id uuid)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT id
  FROM auth.users
  WHERE lower(raw_user_meta_data->>'user_name') = lower(p_github_login)
  LIMIT 1;
$$;

-- RPC: list auth users who logged in but have no developer record yet
CREATE OR REPLACE FUNCTION get_auth_users_without_developer()
RETURNS TABLE(github_login text)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT lower(raw_user_meta_data->>'user_name') AS github_login
  FROM auth.users
  WHERE raw_user_meta_data->>'user_name' IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM developers d
      WHERE d.github_login = lower(raw_user_meta_data->>'user_name')
    );
$$;

-- Backfill: claim all devs whose github_login matches an existing auth user
UPDATE developers d
SET
  claimed     = true,
  claimed_by  = au.id,
  claimed_at  = COALESCE(d.claimed_at, au.created_at)
FROM auth.users au
WHERE
  lower(au.raw_user_meta_data->>'user_name') = d.github_login
  AND d.claimed = false
  AND au.raw_user_meta_data->>'user_name' IS NOT NULL;
