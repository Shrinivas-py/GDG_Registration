begin;

do $$
begin
  if to_regclass('public.registrations') is not null
     and exists (select 1 from public.registrations limit 1) then
    raise exception 'registrations is not empty; setup.sql refused to drop existing data';
  end if;
  if to_regclass('public.student_identifier_map') is not null
     and exists (select 1 from public.student_identifier_map limit 1) then
    raise exception 'student_identifier_map is not empty; setup.sql refused to drop existing data';
  end if;
end $$;

drop function if exists public.create_registration(text, text, text, text, text);
drop table if exists public.student_identifier_map;
drop table if exists public.registrations;

create extension if not exists pgcrypto;

create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sr_no text not null,
  usn text,
  email text not null,
  branch text not null,
  year text not null,
  email_key text generated always as (
    case when split_part(email, '@', 2) in ('gmail.com', 'googlemail.com')
      then replace(split_part(split_part(email, '@', 1), '+', 1), '.', '') || '@gmail.com'
      else email
    end
  ) stored,
  qr_token text not null unique
    default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  fallback_id integer,
  email_delivery_status text not null default 'pending',
  email_delivery_attempts integer not null default 0,
  email_last_error text,
  checked_in boolean not null default false,
  checked_in_at timestamptz,
  created_at timestamptz not null default now(),

  constraint name_valid   check (name = btrim(name) and length(name) between 2 and 100),
  constraint sr_no_valid  check (sr_no ~ '^[0-9]{2}-[0-9]{4}$' and right(sr_no, 4) <> '0000'),
  constraint usn_valid    check (usn is null or (usn ~ '^1JS[0-9]{2}[A-Z]{2}[0-9]{3}$' and right(usn, 3) <> '000')),
  constraint email_valid  check (email = lower(btrim(email)) and length(email) <= 254
                                 and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  constraint branch_valid check (branch in ('CSE','ISE','CSE(AIML)','ECE','EIE','RA','MECH','CIV')),
  constraint year_valid   check (year in ('1st Year','2nd Year','3rd Year','4th Year')),
  constraint checkin_consistent check (checked_in = (checked_in_at is not null)),
  constraint registrations_email_delivery_status_valid check (email_delivery_status in ('pending', 'sent', 'failed')),

  constraint registrations_sr_no_key     unique (sr_no),
  constraint registrations_usn_key       unique (usn),
  constraint registrations_email_key_key unique (email_key)
);

create or replace function public.allocate_fallback_id()
returns integer
language plpgsql
as $$
declare
  candidate integer;
begin
  perform pg_advisory_xact_lock(23002026);
  loop
    candidate := floor(random() * 9000)::integer + 1000;
    if not exists (select 1 from public.registrations where fallback_id = candidate) then
      return candidate;
    end if;
    if not exists (
      select 1 from generate_series(1000, 9999) available(id)
      where not exists (select 1 from public.registrations where fallback_id = available.id)
    ) then
      raise exception 'fallback ID namespace exhausted';
    end if;
  end loop;
end;
$$;

alter table public.registrations
  alter column fallback_id set default public.allocate_fallback_id(),
  alter column fallback_id set not null;

alter table public.registrations
  add constraint registrations_fallback_id_key unique (fallback_id),
  add constraint registrations_fallback_id_valid check (fallback_id between 1000 and 9999);

create index registrations_created_at_idx on public.registrations (created_at desc);

create table public.ticket_recovery_tokens (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index ticket_recovery_tokens_expiry_idx on public.ticket_recovery_tokens (expires_at);

alter table public.registrations enable row level security;
alter table public.ticket_recovery_tokens enable row level security;
revoke all on table public.registrations from anon, authenticated;
revoke all on table public.ticket_recovery_tokens from anon, authenticated;

notify pgrst, 'reload schema';
commit;
