select table_name, row_count
from (
  select 'registrations' as table_name, count(*)::bigint as row_count
  from public.registrations
  union all
  select 'student_identifier_map', count(*)::bigint
  from public.student_identifier_map
) counts
order by table_name;
