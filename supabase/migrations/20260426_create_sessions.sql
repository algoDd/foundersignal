create extension if not exists pgcrypto;

create table if not exists public.sessions (
  report_id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default '',
  input jsonb not null default '{}'::jsonb,
  results_map jsonb not null default '{}'::jsonb,
  status_map jsonb not null default '{}'::jsonb,
  tokens_map jsonb not null default '{}'::jsonb,
  searches_map jsonb not null default '{}'::jsonb,
  interviews jsonb not null default '[]'::jsonb,
  interview_report text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists sessions_user_id_updated_at_idx
  on public.sessions (user_id, updated_at desc);

create or replace function public.set_sessions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists sessions_set_updated_at on public.sessions;
create trigger sessions_set_updated_at
before update on public.sessions
for each row
execute function public.set_sessions_updated_at();

alter table public.sessions enable row level security;

drop policy if exists "users can read own sessions" on public.sessions;
create policy "users can read own sessions"
on public.sessions
for select
using (auth.uid() = user_id);

drop policy if exists "users can insert own sessions" on public.sessions;
create policy "users can insert own sessions"
on public.sessions
for insert
with check (auth.uid() = user_id);

drop policy if exists "users can update own sessions" on public.sessions;
create policy "users can update own sessions"
on public.sessions
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users can delete own sessions" on public.sessions;
create policy "users can delete own sessions"
on public.sessions
for delete
using (auth.uid() = user_id);
