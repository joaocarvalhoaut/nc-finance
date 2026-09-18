-- Somente laboratório/CI: fixtures locais e rollback.
begin;
insert into auth.users(id,email) values ('20000000-0000-4000-8000-000000000001','rpc-test@example.invalid');
insert into public.user_automation_runs(id,user_id) values ('20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001');
do $$ declare signature text; begin
  foreach signature in array array[
    'public.increment_pilot_daily_count(uuid,integer)',
    'public.check_and_increment_pilot_count(uuid,integer,integer)',
    'public.increment_charges_sent(uuid,text,integer)',
    'public.increment_automation_run_counter(uuid,integer,integer)'
  ] loop
    if has_function_privilege('anon',signature,'EXECUTE') or has_function_privilege('authenticated',signature,'EXECUTE') then
      raise exception 'RPC administrativo exposto: %', signature;
    end if;
    if not has_function_privilege('service_role',signature,'EXECUTE') then
      raise exception 'Backend bloqueado: %', signature;
    end if;
  end loop;
end $$;
set local role service_role;
select public.increment_pilot_daily_count('20000000-0000-4000-8000-000000000001',1);
select public.check_and_increment_pilot_count('20000000-0000-4000-8000-000000000001',10,1);
select public.increment_charges_sent('20000000-0000-4000-8000-000000000001','2099-01',1);
select public.increment_automation_run_counter('20000000-0000-4000-8000-000000000002',1,0);
reset role;
do $$ begin
  if (select sent_count from public.pilot_daily_sends where user_id='20000000-0000-4000-8000-000000000001') <> 2 then raise exception 'Contador piloto falhou'; end if;
  if (select charges_sent from public.user_usage_counters where user_id='20000000-0000-4000-8000-000000000001') <> 1 then raise exception 'Contador de uso falhou'; end if;
  if (select sent from public.user_automation_runs where id='20000000-0000-4000-8000-000000000002') <> 1 then raise exception 'Contador da automação falhou'; end if;
end $$;
rollback;
