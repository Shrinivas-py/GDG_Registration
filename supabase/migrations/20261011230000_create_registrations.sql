create extension if not exists pgcrypto;

create table if not exists public.student_identifier_map (
  usn text primary key,
  sr_no text not null unique,
  created_at timestamptz not null default now(),
  check (length(btrim(usn)) > 0),
  check (length(btrim(sr_no)) > 0)
);

create table if not exists public.registrations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  usn_or_srno text not null check (length(btrim(usn_or_srno)) > 0),
  email text not null check (length(btrim(email)) > 0),
  branch text not null check (branch in ('CSE', 'ISE', 'CSE(AIML)', 'ECE', 'EIE', 'RA', 'MECH', 'CIV')),
  year text not null check (year in ('1st Year', '2nd Year', '3rd Year', '4th Year')),
  email_normalized text generated always as (lower(btrim(email))) stored,
  identifier_normalized text generated always as (lower(btrim(usn_or_srno))) stored,
  canonical_sr_no text,
  created_at timestamptz not null default now(),
  constraint registrations_email_normalized_key unique (email_normalized),
  constraint registrations_identifier_normalized_key unique (identifier_normalized),
  constraint registrations_canonical_sr_no_key unique (canonical_sr_no),
  constraint registrations_email_format check (email_normalized ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
);

alter table public.registrations add column if not exists canonical_sr_no text;
update public.registrations
set canonical_sr_no = lower(btrim(usn_or_srno))
where canonical_sr_no is null;
alter table public.registrations alter column canonical_sr_no set not null;

create index if not exists registrations_created_at_idx on public.registrations (created_at desc);

alter table public.registrations enable row level security;
alter table public.student_identifier_map enable row level security;

revoke all on table public.registrations from anon, authenticated;
revoke all on table public.student_identifier_map from anon, authenticated;
