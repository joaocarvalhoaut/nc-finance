-- Fase Polimento: ajustes de RLS e índices adicionais

-- ─── 1. user_configuracoes: DELETE ausente (usuário pode excluir própria config) ─
drop policy if exists "user_configuracoes_delete_own" on public.user_configuracoes;
create policy "user_configuracoes_delete_own"
  on public.user_configuracoes for delete to authenticated
  using (auth.uid() = user_id);

-- ─── 2. user_subscriptions: garantir que frontend NÃO pode escrever ────────────
-- Nenhuma política INSERT/UPDATE/DELETE para 'authenticated' — escrita exclusiva
-- pelo service role via stripe-webhook Edge Function.
-- (comentário de documentação — a ausência de política já bloqueia por padrão com RLS)

-- ─── 3. user_usage_counters: garantir que frontend NÃO pode escrever ────────────
-- Nenhuma política INSERT/UPDATE/DELETE para 'authenticated' — escrita exclusiva
-- pelo service role via Edge Functions de envio.

-- ─── 4. Índices adicionais de performance ────────────────────────────────────────

-- Logs de cobrança: busca por status + data (success-rate mensal)
create index if not exists idx_ulc_user_status_created
  on public.user_logs_cobranca (user_id, status, created_at desc);

-- Registros financeiros: busca por categoria + vencimento
create index if not exists idx_urf_user_category_due
  on public.user_registros_financeiros (user_id, category, due_date);

-- Registros financeiros: busca por status
create index if not exists idx_urf_user_status
  on public.user_registros_financeiros (user_id, status);
