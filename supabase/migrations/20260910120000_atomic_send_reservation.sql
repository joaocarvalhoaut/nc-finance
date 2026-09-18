-- Aplicar antes de publicar as funções de envio. Não altera dados existentes.
begin;
create table if not exists public.charge_send_reservations (
 user_id uuid not null references auth.users(id) on delete cascade,
 reservation_key text not null,
 reserved_until timestamptz not null,
 primary key(user_id, reservation_key)
);
alter table public.charge_send_reservations enable row level security;
revoke all on public.charge_send_reservations from public, anon, authenticated;
create or replace function public.reserve_charge_send(p_user_id uuid, p_key text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare acquired integer;
begin
 if p_user_id is null or p_key is null or length(p_key) <> 64 then
   raise exception 'Reserva inválida';
 end if;
 insert into public.charge_send_reservations(user_id, reservation_key, reserved_until)
 values(p_user_id, p_key, now() + interval '5 minutes')
 on conflict(user_id, reservation_key) do update
 set reserved_until = excluded.reserved_until
 where public.charge_send_reservations.reserved_until <= now();
 get diagnostics acquired = row_count;
 return acquired = 1;
end; $$;
revoke all on function public.reserve_charge_send(uuid,text) from public, anon, authenticated;
grant execute on function public.reserve_charge_send(uuid,text) to service_role;
commit;
