select table_schema, table_name
from information_schema.tables
where table_schema = 'public' and table_name = 'registrations';

select column_name, data_type, is_nullable, column_default, is_generated
from information_schema.columns
where table_schema = 'public' and table_name = 'registrations'
order by ordinal_position;

select conname, contype, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.registrations'::regclass
order by conname;

select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'registrations'
order by indexname;

select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public' and tablename = 'registrations';

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'registrations'
order by grantee, privilege_type;
