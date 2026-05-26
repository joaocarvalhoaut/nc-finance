-- ============================================================
-- Migration: 20260526100000_fix_document_unique_constraint
--
-- Purpose:
--   PostgREST (Supabase) requires a UNIQUE CONSTRAINT (not just
--   a partial unique index) for upsert onConflict to work.
--   Replaces the partial index created in 20260521090000 with a
--   proper unique constraint on (user_id, document_number).
--
--   NULL document_numbers are safe: PostgreSQL does not consider
--   two NULLs equal, so rows without document_number never conflict.
--   Empty strings are normalised to NULL before the constraint.
-- ============================================================

-- ── 1. Normalizar strings vazias para NULL ───────────────────
UPDATE public.user_registros_financeiros
SET document_number = NULL
WHERE document_number = '';

-- ── 2. Remover duplicatas remanescentes (mesma chave) ────────
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
  ) ranked
  WHERE rn > 1
);

-- ── 3. Remover índice parcial anterior ───────────────────────
DROP INDEX IF EXISTS idx_urf_user_document_unique;

-- ── 4. Criar UNIQUE CONSTRAINT (suportada pelo PostgREST) ────
ALTER TABLE public.user_registros_financeiros
  ADD CONSTRAINT uq_urf_user_document
  UNIQUE (user_id, document_number);

COMMENT ON CONSTRAINT uq_urf_user_document
  ON public.user_registros_financeiros IS
  'Unique per (user_id, document_number). NULLs are excluded by PostgreSQL NULL semantics. Required for PostgREST upsert onConflict support.';
