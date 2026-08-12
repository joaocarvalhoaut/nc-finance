-- ═══════════════════════════════════════════════════════════════════════════
-- Log de auditoria — quem fez o quê, quando (prova em caso de disputa/processo)
-- ═══════════════════════════════════════════════════════════════════════════
-- Complementa os logs de autenticação nativos do Supabase (Dashboard → Auth →
-- Logs) registrando AÇÕES SENSÍVEIS da aplicação: exclusão de conta, exportação
-- de dados, mudanças de configuração, etc.
--
-- IMPORTANTE: user_id usa ON DELETE SET NULL (não CASCADE). Assim o registro de
-- "conta X foi excluída em T" SOBREVIVE à exclusão da conta — que é justamente
-- a prova que precisamos manter. O email fica desnormalizado pelo mesmo motivo.
--
-- Integridade: só o service_role (Edge Functions) insere. Usuários só LEEM os
-- próprios eventos (não podem forjar nem apagar) — RLS abaixo.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.user_audit_log (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        references auth.users(id) on delete set null,
  user_email  text,                         -- desnormalizado: sobrevive à exclusão
  action      text        not null,         -- ex.: 'account.deleted', 'data.exported'
  resource    text,                         -- ex.: 'user_registros_financeiros'
  details     jsonb       not null default '{}'::jsonb,
  ip          text,
  user_agent  text,
  created_at  timestamptz not null default timezone('utc', now())
);

create index if not exists idx_ual_user_created
  on public.user_audit_log (user_id, created_at desc);

comment on table public.user_audit_log is
  'Trilha de auditoria de ações sensíveis. Insert só via service_role; usuário lê os próprios (RLS). user_id SET NULL para reter o registro após exclusão da conta.';

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.user_audit_log enable row level security;

-- Usuário lê apenas os próprios eventos.
drop policy if exists "ual_select_own" on public.user_audit_log;
create policy "ual_select_own" on public.user_audit_log
  for select using (auth.uid() = user_id);

-- Sem policies de insert/update/delete para anon/authenticated → negado.
-- O service_role (Edge Functions) ignora RLS e é o único que grava.
