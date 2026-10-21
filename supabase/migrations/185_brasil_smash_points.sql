-- Knocking a building down on the Brasil map scores Brasil points: brasil_points
-- gains the kind 'smash' (5 a building, 50 a day, paid by the smash save,
-- one row per fall: ref = smash:<victim id>:<fell at ms>).

ALTER TABLE public.brasil_points DROP CONSTRAINT IF EXISTS brasil_points_kind_check;
ALTER TABLE public.brasil_points ADD CONSTRAINT brasil_points_kind_check CHECK (kind IN ('join', 'comment', 'invite', 'story', 'vote', 'paint', 'race', 'project', 'smash'));
