-- ═══════════════════════════════════════════════════════════════════════════
-- Índices de escalabilidade — rotas quentes que faziam full-scan
-- ═══════════════════════════════════════════════════════════════════════════
-- Sem estes índices, o custo por consulta cresce linearmente com o volume de
-- dados do usuário (O(n)); com eles, vira busca por índice (O(log n)),
-- mantendo a latência estável de 10 a 1000+ usuários.
--
-- Seguro reexecutar: todos usam "if not exists". Sem CONCURRENTLY porque o
-- script roda dentro de transação no SQL Editor; as tabelas ainda são pequenas,
-- então o lock de criação é de milissegundos. (Em tabelas grandes no futuro,
-- criar índice com CONCURRENTLY fora de transação.)
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Histórico e métricas de cobrança ────────────────────────────────────────
-- O dashboard dispara 4+ queries por carregamento em user_logs_cobranca:
--   • contagem do mês:        WHERE user_id = … AND created_at >= …
--   • contagem por status:    WHERE user_id = … AND status = … AND created_at >= …
--   • erros recentes / lista: WHERE user_id = … [AND status IN …] ORDER BY created_at DESC
-- A idempotência (user_id, idempotency_key, status) já tem índice próprio; estes
-- cobrem o caminho de leitura do histórico/métricas.
create index if not exists idx_ulc_user_created
  on public.user_logs_cobranca (user_id, created_at desc);

create index if not exists idx_ulc_user_status_created
  on public.user_logs_cobranca (user_id, status, created_at desc);

-- 2. Resume de indexação de boletos do Drive ─────────────────────────────────
-- O worker (a cada 5 min) busca linhas com conteúdo ainda não extraído:
--   WHERE metadata_extraction_attempted = false
-- Índice PARCIAL: só indexa as linhas pendentes; conforme são processadas elas
-- saem do índice (flag vira true), mantendo-o pequeno mesmo com milhões de PDFs.
create index if not exists idx_udi_extraction_pending
  on public.user_drive_index (user_id, folder_id)
  where metadata_extraction_attempted = false;
