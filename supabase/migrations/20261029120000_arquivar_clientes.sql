-- ─────────────────────────────────────────────────────────────────────────────
-- Clientes arquivados na Carteira
--
-- Arquivar tira o cliente da lista ativa sem apagar: ele vai para a área
-- "Arquivados" da Carteira e pode ser restaurado. Cliente arquivado nunca é
-- cobrado — nem no envio manual, nem em lote, nem pelas automações (as Edge
-- Functions conferem a coluna).
--
-- Coluna nula = ativo. A RLS da tabela continua valendo (mesma tabela, mesma
-- política por user_id).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.user_registros_financeiros
  add column if not exists archived_at timestamptz;

-- A Carteira e as automações filtram pelos ativos de cada conta.
create index if not exists user_registros_financeiros_ativos_idx
  on public.user_registros_financeiros (user_id)
  where archived_at is null;
