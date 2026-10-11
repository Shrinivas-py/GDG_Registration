create extension if not exists pgcrypto;

create table if not exists public.registrations (
  id uuid primary key default gen_random_uuid(),
  name text,
  usn_or_srno text,
  email text,
  branch text,
  year text,
  email_normalized text generated always as (lower(btrim(email))) stored,
  identifier_normalized text generated always as (lower(btrim(usn_or_srno))) stored,
  created_at timestamptz default now()
);

alter table public.registrations add column if not exists id uuid;
alter table public.registrations add column if not exists name text;
alter table public.registrations add column if not exists usn_or_srno text;
alter table public.registrations add column if not exists email text;
alter table public.registrations add column if not exists branch text;
alter table public.registrations add column if not exists year text;
alter table public.registrations add column if not exists email_normalized text generated always as (lower(btrim(email))) stored;
alter table public.registrations add column if not exists identifier_normalized text generated always as (lower(btrim(usn_or_srno))) stored;
alter table public.registrations add column if not exists canonical_sr_no text;
alter table public.registrations add column if not exists created_at timestamptz;

update public.registrations
set
  canonical_sr_no = coalesce(nullif(canonical_sr_no, ''), lower(btrim(usn_or_srno))),
  created_at = coalesce(created_at, now())
where canonical_sr_no is null
   or created_at is null;

do $$
begin
  if exists (select 1 from public.registrations where id is null or name is null or length(btrim(name)) = 0 or usn_or_srno is null or length(btrim(usn_or_srno)) = 0 or email is null or length(btrim(email)) = 0 or branch is null or year is null or canonical_sr_no is null) then
    raise exception 'registrations contains null or empty required values; resolve conflicts before applying constraints';
  end if;
  if exists (select 1 from public.registrations group by email_normalized having count(*) > 1)
     or exists (select 1 from public.registrations group by identifier_normalized having count(*) > 1)
     or exists (select 1 from public.registrations group by canonical_sr_no having count(*) > 1) then
    raise exception 'registrations contains duplicate normalized email, identifier, or canonical SrNo values; resolve conflicts before applying constraints';
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'registrations_branch_allowed') then
    alter table public.registrations add constraint registrations_branch_allowed check (branch in ('CSE', 'ISE', 'CSE(AIML)', 'ECE', 'EIE', 'RA', 'MECH', 'CIV'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'registrations_year_allowed') then
    alter table public.registrations add constraint registrations_year_allowed check (year in ('1st Year', '2nd Year', '3rd Year', '4th Year'));
  end if;
end $$;

alter table public.registrations alter column id set default gen_random_uuid();
alter table public.registrations alter column id set not null;
alter table public.registrations alter column name set not null;
alter table public.registrations alter column usn_or_srno set not null;
alter table public.registrations alter column email set not null;
alter table public.registrations alter column branch set not null;
alter table public.registrations alter column year set not null;
alter table public.registrations alter column email_normalized set not null;
alter table public.registrations alter column identifier_normalized set not null;
alter table public.registrations alter column canonical_sr_no set not null;
alter table public.registrations alter column created_at set default now();
alter table public.registrations alter column created_at set not null;

create unique index if not exists registrations_email_normalized_key on public.registrations (email_normalized);
create unique index if not exists registrations_identifier_normalized_key on public.registrations (identifier_normalized);
create unique index if not exists registrations_canonical_sr_no_key on public.registrations (canonical_sr_no);
create index if not exists registrations_created_at_idx on public.registrations (created_at desc);

create table if not exists public.student_identifier_map (
  usn text,
  sr_no text,
  created_at timestamptz default now()
);
alter table public.student_identifier_map add column if not exists usn text;
alter table public.student_identifier_map add column if not exists sr_no text;
alter table public.student_identifier_map add column if not exists created_at timestamptz;
update public.student_identifier_map set created_at = coalesce(created_at, now()) where created_at is null;

do $$
begin
  if exists (select 1 from public.student_identifier_map where usn is null or length(btrim(usn)) = 0 or sr_no is null or length(btrim(sr_no)) = 0) then
    raise exception 'student_identifier_map contains null or empty identifiers; resolve conflicts before applying constraints';
  end if;
  if exists (select 1 from public.student_identifier_map group by lower(btrim(usn)) having count(*) > 1)
     or exists (select 1 from public.student_identifier_map group by lower(btrim(sr_no)) having count(*) > 1) then
    raise exception 'student_identifier_map contains duplicate normalized USN or SrNo values; resolve conflicts before applying constraints';
  end if;
  if exists (
    select 1
    from public.student_identifier_map left join public.student_identifier_map other
      on lower(btrim(public.student_identifier_map.usn)) = lower(btrim(other.sr_no))
     and public.student_identifier_map.usn <> other.usn
    where other.usn is not null
  ) then
    raise exception 'student_identifier_map contains an ambiguous USN/SrNo value across students; resolve mapping data before applying constraints';
  end if;
end $$;

alter table public.student_identifier_map alter column usn set not null;
alter table public.student_identifier_map alter column sr_no set not null;
alter table public.student_identifier_map alter column created_at set default now();
alter table public.student_identifier_map alter column created_at set not null;

create unique index if not exists student_identifier_map_usn_normalized_key on public.student_identifier_map (lower(btrim(usn)));
create unique index if not exists student_identifier_map_sr_no_normalized_key on public.student_identifier_map (lower(btrim(sr_no)));

alter table public.registrations enable row level security;
alter table public.student_identifier_map enable row level security;
revoke all on table public.registrations, public.student_identifier_map from anon, authenticated;

create or replace function public.create_registration(
  p_name text,
  p_usn_or_srno text,
  p_email text,
  p_branch text,
  p_year text
) returns table (id uuid, created_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  normalized_identifier text := lower(btrim(p_usn_or_srno));
  normalized_email text := lower(btrim(p_email));
  resolved_sr_no text;
begin
  select lower(btrim(sim.sr_no))
  into resolved_sr_no
  from public.student_identifier_map sim
  where lower(btrim(sim.usn)) = normalized_identifier
     or lower(btrim(sim.sr_no)) = normalized_identifier
  limit 1;

  resolved_sr_no := coalesce(resolved_sr_no, normalized_identifier);

  return query
  insert into public.registrations (name, usn_or_srno, email, branch, year, email_normalized, identifier_normalized, canonical_sr_no)
  values (btrim(p_name), btrim(p_usn_or_srno), btrim(p_email), p_branch, p_year, resolved_sr_no)
  returning registrations.id, registrations.created_at;
end;
$$;

revoke all on function public.create_registration(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_registration(text, text, text, text, text) to service_role;

notify pgrst, 'reload schema';
