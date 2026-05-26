-- ============================================================
-- Migration: 20260521090000_document_number_dedup
--
-- Purpose:
--   Add a unique constraint on (user_id, document_number) so that
--   financeService.createMany can use upsert and avoid duplicate
--   records when the same file is imported more than once.
--
--   Step 1: Remove existing duplicates — keep the most recently
--           updated row per (user_id, document_number) pair.
--   Step 2: Create the partial unique index on the clean data.
-- ============================================================

-- ── 1. Deduplicar registros existentes ───────────────────────────────────────
--   Para cada (user_id, document_number) com múltiplos registros,
--   mantém apenas o mais recente (updated_at DESC, id DESC como desempate).

DELETE FROM public.user_registros_financeiros
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY user_id, document_number
        ORDER BY updated_at DESC, id DESC
      ) AS rn
    FROM public.user_registros_financeiros
    WHERE document_number IS NOT NULL
      AND document_number <> ''
  ) ranked
  WHERE rn > 1
);

-- ── 2. Índice único parcial em (user_id, document_number) ────────────────────
--   Cobre apenas linhas com document_number não-vazio.
--   Idempotente: IF NOT EXISTS evita falha em re-execução.

CREATE UNIQUE INDEX IF NOT EXISTS idx_urf_user_document_unique
  ON public.user_registros_financeiros (user_id, document_number)
  WHERE document_number IS NOT NULL
    AND document_number <> '';

COMMENT ON INDEX idx_urf_user_document_unique IS
  'Prevents duplicate records per user+document_number. Rows without document_number are excluded (matched by phone+name instead).';

-- ── 3. pg_cron setup (execução manual necessária) ────────────────────────────
--
-- Pré-requisitos (Supabase Dashboard → Database → Extensions):
--   Habilitar: pg_cron
--   Habilitar: pg_net  (necessário para net.http_post)
--
-- Depois executar no SQL Editor (substituir <AUTOMATION_CRON_SECRET>):
--
-- SELECT cron.schedule(
--   'nc-finance-scheduler',
--   '0 8 * * *',
--   $$SELECT net.http_post(
--     url     := 'https://hiabmnyyxbedtkigcjdx.supabase.co/functions/v1/run-automation-scheduler',
--     headers := '{"Authorization":"Bearer <AUTOMATION_CRON_SECRET>","Content-Type":"application/json"}'::jsonb,
--     body    := '{}'::jsonb
--   )$$
-- );
--
-- SELECT cron.schedule(
--   'nc-finance-worker',
--   '*/5 * * * *',
--   $$SELECT net.http_post(
--     url     := 'https://hiabmnyyxbedtkigcjdx.supabase.co/functions/v1/process-dispatch-jobs',
--     headers := '{"Authorization":"Bearer <AUTOMATION_CRON_SECRET>","Content-Type":"application/json"}'::jsonb,
--     body    := '{}'::jsonb
--   )$$
-- );
--
-- Verificar: SELECT jobid, schedule, command, active FROM cron.job;
