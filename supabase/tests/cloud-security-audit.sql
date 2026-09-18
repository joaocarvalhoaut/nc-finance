-- Auditoria SOMENTE LEITURA: executar no SQL Editor do projeto a conferir.
-- Não retorna clientes, documentos, valores financeiros ou secrets.
begin read only;

select n.nspname as schema_name, c.relname as table_name,
       c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r'
order by c.relname;

select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies where schemaname in ('public','storage')
order by schemaname, tablename, policyname;

select id, public, file_size_limit, allowed_mime_types
from storage.buckets where id='charge-pdfs';

select p.proname, pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef as security_definer, p.proconfig as settings,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
       has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('reserve_charge_send','check_rate_limit',
  'check_and_increment_pilot_count','increment_pilot_daily_count',
  'increment_charges_sent','increment_automation_run_counter');

rollback;
