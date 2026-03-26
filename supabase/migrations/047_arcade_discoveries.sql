create table arcade_discoveries (
  user_id uuid primary key references auth.users(id) on delete cascade,
  commands text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table arcade_discoveries enable row level security;

create policy "Users can read own discoveries"
  on arcade_discoveries for select
  using (user_id = auth.uid());

create policy "Users can insert own discoveries"
  on arcade_discoveries for insert
  with check (user_id = auth.uid());

create policy "Users can update own discoveries"
  on arcade_discoveries for update
  using (user_id = auth.uid());
