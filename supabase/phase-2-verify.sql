select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'registrations'
  and column_name in ('fallback_id', 'email_delivery_status', 'email_delivery_attempts', 'email_last_error')
order by column_name;

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.registrations'::regclass
  and conname like 'registrations_fallback_id%';

select table_name, rowsecurity
from pg_tables
where schemaname = 'public'
  and table_name = 'ticket_recovery_tokens';
