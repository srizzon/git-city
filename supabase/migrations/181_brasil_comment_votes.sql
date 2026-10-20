-- A comment can vote for president (brasil-instagram.ts voteByComment): its outcome says how it went.
ALTER TABLE public.brasil_comments DROP CONSTRAINT IF EXISTS brasil_comments_outcome_check;
ALTER TABLE public.brasil_comments ADD CONSTRAINT brasil_comments_outcome_check
  CHECK (outcome IN ('added', 'already', 'moved', 'unknown_user', 'no_login', 'blocked', 'capped', 'which_city', 'voted', 'vote_unlinked', 'vote_refused'));
