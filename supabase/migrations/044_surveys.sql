-- Generic survey responses table
create table if not exists survey_responses (
  id bigint generated always as identity primary key,
  survey_id text not null,
  developer_id bigint references developers(id) not null,
  answers jsonb not null default '{}',
  created_at timestamptz default now() not null
);

-- One response per developer per survey
create unique index on survey_responses (survey_id, developer_id);

-- RLS
alter table survey_responses enable row level security;

create policy "Users can submit their own response"
  on survey_responses for insert
  with check (
    developer_id = (
      select id from developers
      where github_login = (auth.jwt() -> 'user_metadata' ->> 'user_name')
      limit 1
    )
  );

create policy "Users can read their own responses"
  on survey_responses for select
  using (
    developer_id = (
      select id from developers
      where github_login = (auth.jwt() -> 'user_metadata' ->> 'user_name')
      limit 1
    )
  );
