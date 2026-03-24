create table arcade_avatars (
  user_id uuid primary key references auth.users(id) on delete cascade,
  config jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

alter table arcade_avatars enable row level security;

create policy "Users can read own avatar"
  on arcade_avatars for select
  using (user_id = auth.uid());

create policy "Users can insert own avatar"
  on arcade_avatars for insert
  with check (user_id = auth.uid());

create policy "Users can update own avatar"
  on arcade_avatars for update
  using (user_id = auth.uid());
