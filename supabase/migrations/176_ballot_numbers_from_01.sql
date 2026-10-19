-- A presidential candidate's number can be 01 to 99 (it was 10 to 99): the
-- town's creator runs as 01. Numbers given out on sign-up still start at 31
-- (src/lib/towns/brasil-election.ts), so 01 to 30 only ever come from the admin.

ALTER TABLE public.brasil_candidates DROP CONSTRAINT IF EXISTS brasil_candidates_number_check;
ALTER TABLE public.brasil_candidates ADD CONSTRAINT brasil_candidates_number_check CHECK (number BETWEEN 1 AND 99);

NOTIFY pgrst, 'reload schema';
