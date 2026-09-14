-- Executar SOMENTE em banco de teste, após as migrations, via psql -v ON_ERROR_STOP=1.
-- Tudo é revertido. Não usa clientes ou mensagens reais.
begin;
insert into auth.users(id,email) values
('10000000-0000-4000-8000-000000000001','tenant-a@example.invalid'),
('10000000-0000-4000-8000-000000000002','tenant-b@example.invalid');
insert into public.user_registros_financeiros(user_id,client_name,document_number,due_date,amount) values
('10000000-0000-4000-8000-000000000001','Fictício A','TEST-A',current_date,1),
('10000000-0000-4000-8000-000000000002','Fictício B','TEST-B',current_date,2);
set local role service_role;
do $$ begin
 if not public.reserve_charge_send('10000000-0000-4000-8000-000000000001',repeat('a',64)) then raise exception 'Primeira reserva recusada'; end if;
 if public.reserve_charge_send('10000000-0000-4000-8000-000000000001',repeat('a',64)) then raise exception 'Duplicidade permitida'; end if;
 if not public.reserve_charge_send('10000000-0000-4000-8000-000000000002',repeat('a',64)) then raise exception 'Reserva de outra conta bloqueada'; end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare total integer; changed integer; begin
 select count(*) into total from public.user_registros_financeiros where document_number in ('TEST-A','TEST-B');
 if total <> 1 then raise exception 'Isolamento de leitura falhou'; end if;
 update public.user_registros_financeiros set amount=999 where user_id='10000000-0000-4000-8000-000000000002';
 get diagnostics changed=row_count;
 if changed <> 0 then raise exception 'Isolamento de escrita falhou'; end if;
 if has_function_privilege(current_user,'public.reserve_charge_send(uuid,text)','EXECUTE') then raise exception 'Usuário pode reservar envios administrativamente'; end if;
end $$;
reset role;
rollback;
