-- ============================================================
-- Migration: 20260521090000_document_number_dedup
--
-- Purpose:
--   Add a unique constraint on (user_id, document_number) so that
--   financeService.createMany can use upsert and avoid duplicate
--   records when the same file is imported more than once via the
--   local PDF/Excel import flow.
--
--   Note: document_number can be empty string (records without a
--   document). The constraint uses a partial index so that only
--   rows with a non-empty document_number are deduplicated.
--   Records without a document_number continue to allow duplicates
--   (the Google Sheets importer falls back to phone+name matching).
-- ============================================================

-- ── 1. Partial unique index on (user_id, document_number) ────────────────────
--   Covers only rows where document_number is non-empty.
--   Idempotent: IF NOT EXISTS prevents failure on re-run.

CREATE UNIQUE INDEX IF NOT EXISTS idx_urf_user_document_unique
  ON public.user_registros_financeiros (user_id, document_number)
  WHERE document_number IS NOT NULL
    AND document_number <> '';

COMMENT ON INDEX idx_urf_user_document_unique IS
  'Prevents duplicate records per user+document_number. Rows without a document_number are excluded (matched by phone+name instead).';

-- ── 2. pg_cron setup (execute manually after enabling extension) ──────────────
--
-- Pre-requisites (run once in Supabase Dashboard → Database → Extensions):
--   Enable: pg_cron
--   Enable: pg_net   (required for net.http_post)
--
-- Then run in SQL Editor (replace <PROJECT_REF> and <AUTOMATION_CRON_SECRET>):
--
-- SELECT cron.unschedule('nc-finance-scheduler')  ON CONFLICT DO NOTHING;
-- SELECT cron.unschedule('nc-finance-worker')     ON CONFLICT DO NOTHING;
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
-- Verify: SELECT jobid, schedule, command, active FROM cron.job;
