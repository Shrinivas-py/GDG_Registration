begin;

alter table public.registrations
  drop constraint if exists sr_no_valid,
  drop constraint if exists usn_valid;

alter table public.registrations
  add constraint sr_no_valid check (sr_no ~ '^[0-9]{2}-[0-9]{4}$' and right(sr_no, 4) <> '0000'),
  add constraint usn_valid check (usn is null or (usn ~ '^1JS[0-9]{2}[A-Z]{2}[0-9]{3}$' and right(usn, 3) <> '000'));

commit;
