begin;

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
    if not exists (
      select 1 from public.registrations where fallback_id = candidate
    ) then
      return candidate;
    end if;
    if not exists (
      select 1 from generate_series(1000, 9999) available(id)
      where not exists (
        select 1 from public.registrations where fallback_id = available.id
      )
    ) then
      raise exception 'fallback ID namespace exhausted';
    end if;
  end loop;
end;
$$;

alter table public.registrations
  add column if not exists fallback_id integer,
  add column if not exists email_delivery_status text not null default 'pending',
  add column if not exists email_delivery_attempts integer not null default 0,
  add column if not exists email_last_error text;

update public.registrations
set fallback_id = public.allocate_fallback_id()
where fallback_id is null;

alter table public.registrations
  alter column fallback_id set default public.allocate_fallback_id(),
  alter column fallback_id set not null;

alter table public.registrations
  add constraint registrations_fallback_id_key unique (fallback_id),
  add constraint registrations_fallback_id_valid check (fallback_id between 1000 and 9999),
  add constraint registrations_email_delivery_status_valid check (email_delivery_status in ('pending', 'sent', 'failed'));

create table if not exists public.ticket_recovery_tokens (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists ticket_recovery_tokens_expiry_idx
  on public.ticket_recovery_tokens (expires_at);

alter table public.ticket_recovery_tokens enable row level security;
revoke all on table public.ticket_recovery_tokens from anon, authenticated;

notify pgrst, 'reload schema';
commit;
