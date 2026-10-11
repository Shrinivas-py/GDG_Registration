select table_schema, table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('registrations', 'student_identifier_map')
order by table_name;

select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('registrations', 'student_identifier_map')
order by table_name, ordinal_position;

select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('registrations', 'student_identifier_map');

select indexname, tablename, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('registrations', 'student_identifier_map')
order by tablename, indexname;

select 'null_canonical_sr_no' as check_name, count(*) as issue_count
from public.registrations
where canonical_sr_no is null
union all
select 'duplicate_email_normalized', count(*)
from (
  select email_normalized from public.registrations group by email_normalized having count(*) > 1
) duplicates
union all
select 'duplicate_canonical_sr_no', count(*)
from (
  select canonical_sr_no from public.registrations group by canonical_sr_no having count(*) > 1
) duplicates;
