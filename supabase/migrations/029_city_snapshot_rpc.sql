-- Single RPC that returns all city data in one SQL call.
-- Eliminates 30+ HTTP round-trips to PostgREST.
CREATE OR REPLACE FUNCTION get_city_snapshot()
RETURNS json
LANGUAGE sql
STABLE
SET statement_timeout = '60s'
AS $$
  SELECT json_build_object(
    'developers', (
      SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
      FROM (
        SELECT id, github_login, name, avatar_url, contributions, total_stars,
               public_repos, primary_language, rank, claimed,
               COALESCE(kudos_count, 0) AS kudos_count,
               COALESCE(visit_count, 0) AS visit_count,
               contributions_total, contribution_years, total_prs, total_reviews,
               repos_contributed_to, followers, following, organizations_count,
               account_created_at, current_streak, active_days_last_year,
               language_diversity,
               COALESCE(app_streak, 0) AS app_streak,
               COALESCE(rabbit_completed, false) AS rabbit_completed,
               district, district_chosen,
               COALESCE(raid_xp, 0) AS raid_xp,
               COALESCE(current_week_contributions, 0) AS current_week_contributions,
               COALESCE(current_week_kudos_given, 0) AS current_week_kudos_given,
               COALESCE(current_week_kudos_received, 0) AS current_week_kudos_received
        FROM developers
        ORDER BY rank ASC
      ) t
    ),
    'purchases', (
      SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
      FROM (
        SELECT developer_id, item_id
        FROM purchases
        WHERE status = 'completed' AND gifted_to IS NULL
      ) t
    ),
    'gift_purchases', (
      SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
      FROM (
        SELECT gifted_to, item_id
        FROM purchases
        WHERE status = 'completed' AND gifted_to IS NOT NULL
      ) t
    ),
    'customizations', (
      SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
      FROM (
        SELECT developer_id, item_id, config
        FROM developer_customizations
        WHERE item_id IN ('custom_color', 'billboard', 'loadout')
      ) t
    ),
    'achievements', (
      SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
      FROM (
        SELECT developer_id, achievement_id
        FROM developer_achievements
      ) t
    ),
    'raid_tags', (
      SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
      FROM (
        SELECT building_id, attacker_login, tag_style, expires_at
        FROM raid_tags
        WHERE active = true
      ) t
    ),
    'stats', (
      SELECT row_to_json(t)
      FROM (SELECT * FROM city_stats WHERE id = 1) t
    )
  );
$$;
