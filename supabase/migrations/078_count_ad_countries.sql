-- Count unique countries for a specific ad
-- sky_ads.id and sky_ad_events.ad_id are text, so the parameter must be text;
-- the original uuid signature made this migration error on a fresh apply.
create or replace function count_ad_countries(p_ad_id text)
returns integer
language sql
stable
security definer
as $$
  select count(distinct country)::integer
  from sky_ad_events
  where ad_id = p_ad_id
    and country is not null
    and country != '';
$$;
