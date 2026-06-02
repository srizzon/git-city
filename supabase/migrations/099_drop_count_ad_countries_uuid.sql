-- Migration 078 changed count_ad_countries' parameter from uuid -> text via
-- CREATE OR REPLACE. Because the argument type changed, Postgres created a NEW
-- overload instead of replacing the old one. On environments where 078 was
-- already applied with the uuid signature (i.e. prod), the stale
-- count_ad_countries(uuid) overload still exists alongside the text version.
--
-- sky_ads.id / sky_ad_events.ad_id are text and all callers pass text, so the
-- uuid overload is dead. Drop it so only the correct signature remains.
drop function if exists count_ad_countries(uuid);
