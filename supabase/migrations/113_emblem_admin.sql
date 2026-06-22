-- ─── Emblems admin: distribution stats ────────────────────────────────────
-- A lightweight view so the admin panel can show, per emblem, how many devs
-- hold it (holders) and how many total grants exist (total_grants — sum of the
-- per-dev counter). Cheap aggregate over emblem_grants; scales fine.

BEGIN;

CREATE OR REPLACE VIEW emblem_stats AS
SELECT
  e.id AS emblem_id,
  COALESCE(g.holders, 0)::bigint      AS holders,
  COALESCE(g.total_grants, 0)::bigint AS total_grants
FROM emblems e
LEFT JOIN (
  SELECT emblem_id, count(*) AS holders, sum(count) AS total_grants
  FROM emblem_grants
  GROUP BY emblem_id
) g ON g.emblem_id = e.id;

-- Admin reads this through the service_role client.
GRANT SELECT ON emblem_stats TO service_role;
GRANT SELECT ON emblem_stats TO anon, authenticated;

COMMIT;
