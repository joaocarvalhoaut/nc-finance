-- Cobradores (10/11/2026): quem cobra cada devedor.
--
-- Cobrador NÃO é representante/responsável (user_representantes). São
-- cadastros diferentes: a primeira versão (commit 3d120de) gravou cobradores
-- em user_representantes e o dono apontou o erro. Esta migration:
--   1. cria user_cobradores (RLS por user_id);
--   2. põe cobrador_id no título e na regra de automação;
--   3. move para cá os cobradores criados por engano como representantes
--      (role 'Cobrador', criados a partir de 10/11/2026) e os títulos/regras
--      ligados a eles;
--   4. desfaz a coluna representative_id da regra (migration 20261110120000),
--      se ela chegou a rodar.
-- Pode rodar mais de uma vez.

create table if not exists public.user_cobradores (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null check (length(btrim(name)) between 1 and 80),
  phone      text not null default '',
  color      text not null default 'bg-emerald-500',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_user_cobradores_user on public.user_cobradores (user_id);

alter table public.user_cobradores enable row level security;

drop policy if exists "user_cobradores_select_own" on public.user_cobradores;
create policy "user_cobradores_select_own"
on public.user_cobradores for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "user_cobradores_insert_own" on public.user_cobradores;
create policy "user_cobradores_insert_own"
on public.user_cobradores for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists "user_cobradores_update_own" on public.user_cobradores;
create policy "user_cobradores_update_own"
on public.user_cobradores for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "user_cobradores_delete_own" on public.user_cobradores;
create policy "user_cobradores_delete_own"
on public.user_cobradores for delete to authenticated
using (auth.uid() = user_id);

-- Título: excluir o cobrador deixa o título sem cobrador.
alter table public.user_registros_financeiros
  add column if not exists cobrador_id uuid
    references public.user_cobradores(id) on delete set null;

create index if not exists idx_urf_user_cobrador
  on public.user_registros_financeiros (user_id, cobrador_id)
  where cobrador_id is not null;

-- Regra: excluir o cobrador apaga as regras só dele. Com "set null" a regra
-- passaria, calada, a cobrar a carteira inteira.
alter table public.user_automation_rules
  add column if not exists cobrador_id uuid
    references public.user_cobradores(id) on delete cascade;

-- Cobrador tem de ser da mesma conta do título/regra (a FK sozinha aceitaria
-- o id do cobrador de outra conta).
create or replace function public.cobrador_da_mesma_conta()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.cobrador_id is not null and not exists (
    select 1 from public.user_cobradores c
    where c.id = new.cobrador_id and c.user_id = new.user_id
  ) then
    raise exception 'Cobrador inválido.' using errcode = '23503';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_urf_cobrador_conta on public.user_registros_financeiros;
create trigger trg_urf_cobrador_conta
before insert or update of cobrador_id, user_id on public.user_registros_financeiros
for each row execute function public.cobrador_da_mesma_conta();

drop trigger if exists trg_uar_cobrador_conta on public.user_automation_rules;
create trigger trg_uar_cobrador_conta
before insert or update of cobrador_id, user_id on public.user_automation_rules
for each row execute function public.cobrador_da_mesma_conta();

-- ── Conserta a primeira versão ────────────────────────────────────────────
-- Cobradores criados pela tela nova (role 'Cobrador') viram cobradores de
-- verdade, com o mesmo id; os títulos ligados a eles passam para cobrador_id.
insert into public.user_cobradores (id, user_id, name, phone, color, created_at, updated_at)
select r.id, r.user_id, r.name, coalesce(r.phone, ''), r.color, r.created_at, r.updated_at
from public.user_representantes r
where r.role = 'Cobrador' and r.created_at >= '2026-11-10'
on conflict (id) do nothing;

update public.user_registros_financeiros f
set cobrador_id = f.representative_id, representative_id = null
where f.representative_id in (
  select c.id from public.user_cobradores c where c.user_id = f.user_id
);

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_automation_rules' and column_name = 'representative_id'
  ) then
    update public.user_automation_rules a
    set cobrador_id = a.representative_id
    where a.representative_id in (select c.id from public.user_cobradores c where c.user_id = a.user_id);
    alter table public.user_automation_rules drop column representative_id;
  end if;
end;
$$;

delete from public.user_representantes r
where r.id in (select c.id from public.user_cobradores c);

-- Conferência: cobradores, títulos com cobrador e representantes que sobraram.
select
  (select count(*) from public.user_cobradores)                                        as cobradores,
  (select count(*) from public.user_registros_financeiros where cobrador_id is not null) as titulos_com_cobrador,
  (select count(*) from public.user_representantes)                                    as representantes;
