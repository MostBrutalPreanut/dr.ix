-- Run this once in the Supabase SQL editor (Project -> SQL Editor -> New query).

create table if not exists public.docs (
  collection text        not null,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (collection, id)
);

alter table public.docs enable row level security;

-- PHASE 1 ONLY: any holder of the anon key (i.e. anyone who opens the app) can read and write.
-- This is acceptable while the data is just handbook / checklists / games, but MUST be
-- replaced by a server-side gateway with real sessions before tips and wages go in
-- (see docs/security.md).
drop policy if exists "phase1 open access" on public.docs;
create policy "phase1 open access" on public.docs
  for all to anon using (true) with check (true);

-- Live updates between devices
alter publication supabase_realtime add table public.docs;
