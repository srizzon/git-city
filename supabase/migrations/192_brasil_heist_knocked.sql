-- City of the day: how much of the city stands is counted in blocks (one
-- floor of one column), not in buildings that fell all the way. Robbers chip
-- floors off without finishing buildings, so counting only falls left the city
-- "standing" however hard it was hit.
--   blocks   the city's blocks (floors × columns), counted on the day's first ask
--   knocked  blocks knocked off it that day, added by the drive room's saves

BEGIN;

ALTER TABLE public.brasil_heist_days
  ADD COLUMN IF NOT EXISTS blocks integer CHECK (blocks > 0),
  ADD COLUMN IF NOT EXISTS knocked integer NOT NULL DEFAULT 0 CHECK (knocked >= 0);

-- One atomic add per save; a settled day takes no more.
CREATE OR REPLACE FUNCTION public.brasil_heist_knock(p_day date, p_n integer)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.brasil_heist_days SET knocked = knocked + p_n
  WHERE day = p_day AND settled_at IS NULL AND p_n > 0;
$$;

REVOKE ALL ON FUNCTION public.brasil_heist_knock(date, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.brasil_heist_knock(date, integer) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
