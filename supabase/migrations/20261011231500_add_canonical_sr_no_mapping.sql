create table if not exists public.student_identifier_map (
  usn text primary key,
  sr_no text not null unique,
  created_at timestamptz not null default now(),
  check (length(btrim(usn)) > 0),
  check (length(btrim(sr_no)) > 0)
);

alter table public.registrations
  add column if not exists canonical_sr_no text;

update public.registrations
set canonical_sr_no = lower(btrim(usn_or_srno))
where canonical_sr_no is null;

alter table public.registrations
  alter column canonical_sr_no set not null;

create unique index if not exists registrations_canonical_sr_no_key
  on public.registrations (canonical_sr_no);

alter table public.registrations enable row level security;
alter table public.student_identifier_map enable row level security;

revoke all on table public.registrations from anon, authenticated;
revoke all on table public.student_identifier_map from anon, authenticated;
