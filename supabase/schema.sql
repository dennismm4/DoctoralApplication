-- Run this once in Supabase Dashboard → SQL Editor.
-- Each authenticated account can access only its own Doctoral Compass record.
create table if not exists public.applicant_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  updated_at timestamptz not null default now()
);

alter table public.applicant_data enable row level security;
revoke all on table public.applicant_data from anon;
grant select, insert, update, delete on table public.applicant_data to authenticated;

drop policy if exists "Applicants can access only their own data" on public.applicant_data;
create policy "Applicants can access only their own data"
  on public.applicant_data
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
