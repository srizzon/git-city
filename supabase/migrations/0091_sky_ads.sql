-- Sky Ads catalog (moves from hardcoded to DB)
create table sky_ads (
  id text primary key,
  brand text not null,
  text text not null,
  description text,
  color text not null default '#f8d880',
  bg_color text not null default '#1a1018',
  link text,
  vehicle text not null default 'plane' check (vehicle in ('plane', 'blimp')),
  priority integer not null default 50,
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

-- Ad events (impressions + clicks in one table, type column)
create table sky_ad_events (
  id bigint generated always as identity primary key,
  ad_id text not null references sky_ads(id),
  event_type text not null check (event_type in ('impression', 'click', 'cta_click')),
  ip_hash text,
  user_agent text,
  created_at timestamptz not null default now()
);

-- Indexes
create index idx_sky_ad_events_ad_id on sky_ad_events(ad_id);
create index idx_sky_ad_events_created on sky_ad_events(created_at);
create index idx_sky_ad_events_type on sky_ad_events(ad_id, event_type);

-- Daily aggregate materialized view (fast dashboard queries)
create materialized view sky_ad_daily_stats as
select
  ad_id,
  date_trunc('day', created_at)::date as day,
  count(*) filter (where event_type = 'impression') as impressions,
  count(*) filter (where event_type = 'click') as clicks,
  count(*) filter (where event_type = 'cta_click') as cta_clicks
from sky_ad_events
group by ad_id, date_trunc('day', created_at)::date;

create unique index idx_sky_ad_daily_stats on sky_ad_daily_stats(ad_id, day);

-- RLS: public read for active ads, insert events via service role only
alter table sky_ads enable row level security;
alter table sky_ad_events enable row level security;

create policy "Public can read active ads"
  on sky_ads for select using (active = true and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()));

-- No policies on sky_ad_events: RLS blocks all anon/authenticated access.
-- Only service role (used by our API routes) can insert/read, bypassing RLS.

-- Helper function to refresh the materialized view (called from API)
create or replace function refresh_sky_ad_stats()
returns void language plpgsql security definer as $$
begin
  refresh materialized view concurrently sky_ad_daily_stats;
end;
$$;

-- Seed default ads
insert into sky_ads (id, brand, text, description, color, bg_color, link, vehicle, priority) values
  ('gitcity', 'Git City', 'THEGITCITY.COM ★ YOUR CODE, YOUR CITY ★ THEGITCITY.COM', 'A city built from GitHub contributions. Search your username and find your building among thousands of developers.', '#f8d880', '#1a1018', 'https://thegitcity.com', 'plane', 100),
  ('samuel', 'Samuel Rizzon', 'HEY, I BUILD THIS! → SAMUELRIZZON.DEV', 'Full-stack dev who builds weird and cool stuff. This city is one of them.', '#c8e64a', '#1a1018', 'https://www.samuelrizzon.dev/en.html', 'plane', 90),
  ('build', 'ReplyOS', 'YOUR AI COPILOT TO GROW ON X', 'I grew +1.2k followers and 1M views in 3 weeks using ReplyOS. Viral library, lead radar, post writer, auto-replies. Your AI copilot to grow on X.', '#ffffff', '#2a1838', 'https://reply-os.com', 'blimp', 80),
  ('advertise', 'Sky Ads', 'ADD YOUR AD HERE', 'Want your brand flying over Git City? Planes, blimps, your colors. Get in touch!', '#f8d880', '#1a1018', 'mailto:samuelrizzondev@gmail.com?subject=Git%20City%20Sky%20Ad', 'plane', 10);
