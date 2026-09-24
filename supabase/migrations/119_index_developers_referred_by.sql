-- Profile page (/dev/[username]) lists who a developer referred:
--   where referred_by = $login order by claimed_at desc limit 20
-- Without an index this scanned all developers and hit the statement timeout
-- (~8s) on every profile view, so the page took ~9s and the list never loaded.
CREATE INDEX IF NOT EXISTS idx_developers_referred_by
  ON developers (referred_by, claimed_at DESC)
  WHERE referred_by IS NOT NULL;
