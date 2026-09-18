-- RPCs de contagem são chamados exclusivamente por Edge Functions com service_role.
-- GRANT ao backend não remove o EXECUTE que PostgreSQL concede a PUBLIC.
begin;
revoke all on function public.increment_pilot_daily_count(uuid, integer) from public, anon, authenticated;
revoke all on function public.check_and_increment_pilot_count(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.increment_charges_sent(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.increment_automation_run_counter(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.increment_pilot_daily_count(uuid, integer) to service_role;
grant execute on function public.check_and_increment_pilot_count(uuid, integer, integer) to service_role;
grant execute on function public.increment_charges_sent(uuid, text, integer) to service_role;
grant execute on function public.increment_automation_run_counter(uuid, integer, integer) to service_role;
commit;
