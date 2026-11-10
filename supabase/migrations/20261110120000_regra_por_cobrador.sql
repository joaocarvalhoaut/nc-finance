-- Regra de automação por cobrador (10/11/2026).
--
-- representative_id nulo = a regra cobra a carteira toda (como antes).
-- Com um cobrador, a regra só cobra os títulos dele.
--
-- on delete cascade: excluir o cobrador apaga as regras dele. Com "set null"
-- a regra passaria, calada, a cobrar a carteira inteira.

alter table public.user_automation_rules
  add column if not exists representative_id uuid
    references public.user_representantes(id) on delete cascade;

create index if not exists idx_uar_representative_id
  on public.user_automation_rules (representative_id)
  where representative_id is not null;

-- Busca rápida dos títulos de um cobrador (abas da Carteira e automação).
create index if not exists idx_urf_user_representative
  on public.user_registros_financeiros (user_id, representative_id)
  where representative_id is not null;
