-- 085_lobby_elevator_range.sql
-- Expand the lobby elevator's interact area so players standing at y=2 (below
-- the sprite) are detected by findNearbyObject. Previously: y=0, height=1
-- (range -1..1, unreachable). Now: y=0, height=2 (range -1..2).

BEGIN;

UPDATE arcade_rooms
SET map_json = jsonb_set(
  map_json,
  '{objects}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN obj->>'type' = 'elevator'
          THEN obj || '{"height": 2}'::jsonb
        ELSE obj
      END
    )
    FROM jsonb_array_elements(map_json->'objects') obj
  )
),
updated_at = now()
WHERE slug = 'lobby';

COMMIT;
