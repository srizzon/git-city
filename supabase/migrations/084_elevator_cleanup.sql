-- 084_elevator_cleanup.sql
-- Clean up a bogus 'arcade' room that was briefly seeded, and remove the stale
-- 'floor-1' portal on the lobby (that floor never existed). Elevator routing now
-- reads from the `portals` column on arcade_rooms, not from map_json.objects.

BEGIN;

-- 1. Remove the bogus arcade room (only if it still has no user-created content).
DELETE FROM arcade_rooms WHERE slug = 'arcade';

-- 2. Remove the `destination` key that was injected into the lobby elevator object.
UPDATE arcade_rooms
SET map_json = jsonb_set(
  map_json,
  '{objects}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN obj->>'type' = 'elevator' THEN obj - 'destination'
        ELSE obj
      END
    )
    FROM jsonb_array_elements(map_json->'objects') obj
  )
),
updated_at = now()
WHERE slug = 'lobby';

-- 3. Drop the stale 'floor-1' portal from the lobby (fsociety is the live Floor 1).
UPDATE arcade_rooms
SET portals = (
  SELECT COALESCE(jsonb_agg(p), '[]'::jsonb)
  FROM jsonb_array_elements(portals) p
  WHERE p->>'destination' <> 'floor-1'
),
updated_at = now()
WHERE slug = 'lobby';

COMMIT;
