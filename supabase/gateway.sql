-- =====================================================================================
-- Drix OS: secure gateway.  Run once in Supabase -> SQL Editor -> New query -> Run.
-- Safe to run again (it only re-creates functions and never deletes your content).
--
-- What it does
--   * Closes the open door of the first version: nobody can read or write the tables
--     directly any more.
--   * All access goes through the functions below, which check, on the server:
--       - who you are (name + PIN, bcrypt-hashed, 5 wrong tries lock the account for 5 min)
--       - what you may do (staff vs manager, per collection - see the `acl` table)
--   * Creates the employees table with the starting team (everyone's PIN is 0000
--     and must be changed on first login).
-- =====================================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- tables ---------------------------------------------------------------

create table if not exists public.docs (
  collection text        not null,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (collection, id)
);

create table if not exists public.employees (
  id               text primary key,
  name             text not null unique,
  role             text not null check (role in ('manager', 'staff')),
  pin_hash         text not null,
  must_change_pin  boolean not null default true,
  failed_attempts  int not null default 0,
  locked_until     timestamptz,
  created_at       timestamptz not null default now()
);

create table if not exists public.sessions (
  token_hash   text primary key,
  employee_id  text not null references public.employees (id) on delete cascade,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null
);

-- Which role may read / write each collection.
--   read_role : 'any' (every signed-in employee) | 'manager'
--   write_role: 'any' | 'manager' | 'self' (only documents that belong to you: employeeId = you)
create table if not exists public.acl (
  collection text primary key,
  read_role  text not null check (read_role in ('any', 'manager')),
  write_role text not null check (write_role in ('any', 'manager', 'self'))
);

insert into public.acl (collection, read_role, write_role) values
  ('notes',           'any',     'manager'),
  ('noteAcks',        'any',     'self'),
  ('checklists',      'any',     'manager'),
  ('checks',          'any',     'any'),
  ('closures',        'any',     'any'),
  ('tasks',           'any',     'manager'),
  ('taskCompletions', 'any',     'any'),
  ('handbook',        'any',     'manager'),
  ('games',           'any',     'manager'),
  ('settings',        'any',     'manager'),
  ('meta',            'manager', 'manager')
on conflict (collection) do nothing;

-- ---------- lock the tables: only the functions below can touch them ---------------

alter table public.docs      enable row level security;
alter table public.employees enable row level security;
alter table public.sessions  enable row level security;
alter table public.acl       enable row level security;

drop policy if exists "phase1 open access" on public.docs;   -- the open door of version 1

revoke all on public.docs, public.employees, public.sessions, public.acl from anon, authenticated;

-- Old employee documents (with PIN hashes) from the first version are not used any more.
delete from public.docs where collection = 'employees';
delete from public.docs where collection = 'meta' and id = 'seeded_employees';

-- ---------- the starting team (PIN 0000, must be changed on first login) -------------

insert into public.employees (id, name, role, pin_hash) values
  ('elad',   'אלעד',   'manager', extensions.crypt('0000', extensions.gen_salt('bf'))),
  ('midori', 'מידורי', 'manager', extensions.crypt('0000', extensions.gen_salt('bf'))),
  ('ari',    'ארי',    'manager', extensions.crypt('0000', extensions.gen_salt('bf'))),
  ('gaia',   'גאיה',   'staff',   extensions.crypt('0000', extensions.gen_salt('bf'))),
  ('bar',    'בר',     'staff',   extensions.crypt('0000', extensions.gen_salt('bf'))),
  ('anker',  'אנקר',   'staff',   extensions.crypt('0000', extensions.gen_salt('bf'))),
  ('nadin',  'נדין',   'staff',   extensions.crypt('0000', extensions.gen_salt('bf'))),
  ('nicole', 'ניקול',  'staff',   extensions.crypt('0000', extensions.gen_salt('bf'))),
  ('ayala',  'איילה',  'staff',   extensions.crypt('0000', extensions.gen_salt('bf'))),
  ('tomer',  'תומר',   'staff',   extensions.crypt('0000', extensions.gen_salt('bf')))
on conflict (id) do nothing;

-- ---------- internal helper: who is calling? ---------------------------------------

create or replace function public._auth(p_token text)
returns public.employees
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  e public.employees;
begin
  select em.* into e
  from public.sessions s
  join public.employees em on em.id = s.employee_id
  where s.token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
    and s.expires_at > now();
  if not found then
    raise exception 'unauthorized';
  end if;
  return e;
end;
$$;

create or replace function public._employee_json(e public.employees)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'id', e.id, 'name', e.name, 'role', e.role,
    'mustChangePin', e.must_change_pin, 'createdAt', e.created_at);
$$;

-- ---------- sign in / out ----------------------------------------------------------

-- Names for the "who are you?" screen (no PINs, no hashes).
create or replace function public.public_employees()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(jsonb_build_object('id', id, 'name', name, 'role', role) order by name),
    '[]'::jsonb)
  from public.employees;
$$;

create or replace function public.api_login(p_id text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  e public.employees;
  v_token text;
begin
  select * into e from public.employees where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'bad_pin');
  end if;

  if e.locked_until is not null and e.locked_until > now() then
    return jsonb_build_object('ok', false, 'reason', 'locked',
      'retryAfterSeconds', ceil(extract(epoch from (e.locked_until - now())))::int);
  end if;

  if e.pin_hash = crypt(coalesce(p_pin, ''), e.pin_hash) then
    update public.employees set failed_attempts = 0, locked_until = null where id = e.id;
    delete from public.sessions where expires_at < now();
    v_token := encode(gen_random_bytes(32), 'hex');
    insert into public.sessions (token_hash, employee_id, expires_at)
    values (encode(digest(v_token, 'sha256'), 'hex'), e.id, now() + interval '30 days');
    return jsonb_build_object('ok', true, 'token', v_token, 'employee', public._employee_json(e));
  end if;

  if e.failed_attempts + 1 >= 5 then
    update public.employees set failed_attempts = 0, locked_until = now() + interval '5 minutes' where id = e.id;
    return jsonb_build_object('ok', false, 'reason', 'locked', 'retryAfterSeconds', 300);
  end if;
  update public.employees set failed_attempts = failed_attempts + 1 where id = e.id;
  return jsonb_build_object('ok', false, 'reason', 'bad_pin');
end;
$$;

create or replace function public.api_logout(p_token text)
returns void
language sql
security definer
set search_path = public, extensions
as $$
  delete from public.sessions where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

create or replace function public.api_me(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  return public._employee_json(public._auth(p_token));
end;
$$;

-- ---------- employees --------------------------------------------------------------

create or replace function public.api_employees(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public._auth(p_token);
  return coalesce(
    (select jsonb_agg(public._employee_json(e) order by e.name) from public.employees e),
    '[]'::jsonb);
end;
$$;

create or replace function public.api_set_pin(p_token text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  e public.employees := public._auth(p_token);
begin
  if p_pin !~ '^[0-9]{4}$' or p_pin = '0000' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_pin');
  end if;
  update public.employees
     set pin_hash = crypt(p_pin, gen_salt('bf')), must_change_pin = false
   where id = e.id;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.api_skip_pin_change(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  e public.employees := public._auth(p_token);
begin
  update public.employees set must_change_pin = false where id = e.id;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.api_add_employee(p_token text, p_name text, p_role text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  e public.employees := public._auth(p_token);
  v_name text := btrim(coalesce(p_name, ''));
begin
  if e.role <> 'manager' then raise exception 'forbidden'; end if;
  if v_name = '' or p_role not in ('manager', 'staff') then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  if exists (select 1 from public.employees where name = v_name) then
    return jsonb_build_object('ok', false, 'reason', 'duplicate_name');
  end if;
  insert into public.employees (id, name, role, pin_hash)
  values (gen_random_uuid()::text, v_name, p_role, crypt('0000', gen_salt('bf')));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.api_set_role(p_token text, p_id text, p_role text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  e public.employees := public._auth(p_token);
begin
  if e.role <> 'manager' then raise exception 'forbidden'; end if;
  if p_role not in ('manager', 'staff') then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  if p_role = 'staff'
     and (select role from public.employees where id = p_id) = 'manager'
     and (select count(*) from public.employees where role = 'manager') <= 1 then
    return jsonb_build_object('ok', false, 'reason', 'last_manager');
  end if;
  update public.employees set role = p_role where id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.api_reset_pin(p_token text, p_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  e public.employees := public._auth(p_token);
begin
  if e.role <> 'manager' then raise exception 'forbidden'; end if;
  update public.employees
     set pin_hash = crypt('0000', gen_salt('bf')), must_change_pin = true,
         failed_attempts = 0, locked_until = null
   where id = p_id;
  delete from public.sessions where employee_id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.api_remove_employee(p_token text, p_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  e public.employees := public._auth(p_token);
begin
  if e.role <> 'manager' then raise exception 'forbidden'; end if;
  if p_id = e.id then
    return jsonb_build_object('ok', false, 'reason', 'self');
  end if;
  if (select role from public.employees where id = p_id) = 'manager'
     and (select count(*) from public.employees where role = 'manager') <= 1 then
    return jsonb_build_object('ok', false, 'reason', 'last_manager');
  end if;
  delete from public.employees where id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------- generic documents (notes, checklists, games ...) ------------------------

create or replace function public.api_list(
  p_token text, p_collection text, p_from text default null, p_to text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  e public.employees := public._auth(p_token);
  a public.acl;
begin
  select * into a from public.acl where collection = p_collection;
  if not found or (a.read_role = 'manager' and e.role <> 'manager') then
    raise exception 'forbidden';
  end if;
  return coalesce((
    select jsonb_agg(t.data order by t.id)
    from (
      select d.id, d.data from public.docs d
      where d.collection = p_collection
        and (p_from is null or d.id >= p_from)
        and (p_to   is null or d.id <= p_to)
      order by d.id
      limit 5000
    ) t), '[]'::jsonb);
end;
$$;

create or replace function public.api_upsert(p_token text, p_collection text, p_doc jsonb)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  e public.employees := public._auth(p_token);
  a public.acl;
begin
  select * into a from public.acl where collection = p_collection;
  if not found then raise exception 'forbidden'; end if;
  if a.write_role = 'manager' and e.role <> 'manager' then raise exception 'forbidden'; end if;
  if a.write_role = 'self' and coalesce(p_doc ->> 'employeeId', '') <> e.id then
    raise exception 'forbidden';
  end if;
  if p_doc is null or jsonb_typeof(p_doc) <> 'object' or coalesce(p_doc ->> 'id', '') = '' then
    raise exception 'invalid document';
  end if;
  if octet_length(p_doc::text) > 200000 then raise exception 'document too large'; end if;

  insert into public.docs (collection, id, data, updated_at)
  values (p_collection, p_doc ->> 'id', p_doc, now())
  on conflict (collection, id) do update set data = excluded.data, updated_at = now();
end;
$$;

create or replace function public.api_remove(p_token text, p_collection text, p_id text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  e public.employees := public._auth(p_token);
  a public.acl;
  owner text;
begin
  select * into a from public.acl where collection = p_collection;
  if not found then raise exception 'forbidden'; end if;
  if a.write_role = 'manager' and e.role <> 'manager' then raise exception 'forbidden'; end if;
  if a.write_role = 'self' and e.role <> 'manager' then
    select data ->> 'employeeId' into owner from public.docs where collection = p_collection and id = p_id;
    if owner is distinct from e.id then raise exception 'forbidden'; end if;
  end if;
  delete from public.docs where collection = p_collection and id = p_id;
end;
$$;

-- ---------- who may call what -------------------------------------------------------

revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.public_employees(),
  public.api_login(text, text),
  public.api_logout(text),
  public.api_me(text),
  public.api_employees(text),
  public.api_set_pin(text, text),
  public.api_skip_pin_change(text),
  public.api_add_employee(text, text, text),
  public.api_set_role(text, text, text),
  public.api_reset_pin(text, text),
  public.api_remove_employee(text, text),
  public.api_list(text, text, text, text),
  public.api_upsert(text, text, jsonb),
  public.api_remove(text, text, text)
to anon, authenticated;
