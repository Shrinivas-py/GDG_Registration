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
      else split_part(split_part(email, '@', 1), '+', 1) || '@' || split_part(email, '@', 2)
    end
  ) stored,
  qr_token text not null unique
    default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  checked_in boolean not null default false,
  checked_in_at timestamptz,
  created_at timestamptz not null default now(),

  constraint name_valid   check (name = btrim(name) and length(name) between 2 and 100),
  constraint sr_no_valid  check (sr_no ~ '^\d{2}-\d{4}$'),
  constraint usn_valid    check (usn is null or usn ~ '^1JS\d{2}[A-Z]{2}\d{3}$'),
  constraint email_valid  check (email = lower(btrim(email)) and length(email) <= 254
                                 and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  constraint branch_valid check (branch in ('CSE','ISE','CSE(AIML)','ECE','EIE','RA','MECH','CIV')),
  constraint year_valid   check (year in ('1st Year','2nd Year','3rd Year','4th Year')),
  constraint checkin_consistent check (checked_in = (checked_in_at is not null)),

  constraint registrations_sr_no_key     unique (sr_no),
  constraint registrations_usn_key       unique (usn),
  constraint registrations_email_key_key unique (email_key)
);

create index registrations_created_at_idx on public.registrations (created_at desc);

alter table public.registrations enable row level security;
revoke all on table public.registrations from anon, authenticated;

notify pgrst, 'reload schema';
commit;
