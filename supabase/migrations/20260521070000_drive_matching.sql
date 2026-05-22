-- ============================================================
-- Migration: 20260521070000_drive_matching
--
-- Adds per-user Drive folder config and a full PDF index table.
-- Enables:
--   1. Each user saves their own Drive folder URL (not a global env var)
--   2. PDFs are indexed with extracted metadata (linha digitável, CPF/CNPJ, etc.)
--   3. Matching runs against the index for high-confidence auto-attach
-- ============================================================

-- ── 1. user_drive_folders ─────────────────────────────────────────────────────
--   One row per user: their chosen Drive folder for boleto PDFs.

CREATE TABLE IF NOT EXISTS public.user_drive_folders (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID         NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  folder_url         TEXT         NOT NULL,          -- original URL pasted by user
  folder_id          TEXT         NOT NULL,          -- extracted Drive folder ID
  folder_name        TEXT,                           -- resolved folder name (from API)
  is_accessible      BOOLEAN      NOT NULL DEFAULT false,
  file_count         INT          NOT NULL DEFAULT 0,
  last_indexed_at    TIMESTAMPTZ,
  last_index_error   TEXT,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.user_drive_folders IS 'Per-user Drive folder config for boleto PDF matching. Service-role write, authenticated read-own only.';

ALTER TABLE public.user_drive_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "udf_select_own" ON public.user_drive_folders;
CREATE POLICY "udf_select_own"
  ON public.user_drive_folders FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- No INSERT/UPDATE for authenticated — only service_role writes
CREATE INDEX IF NOT EXISTS idx_udf_user_id ON public.user_drive_folders (user_id);

-- ── 2. user_drive_index ───────────────────────────────────────────────────────
--   One row per PDF file found in the user's folder.
--   Stores extracted metadata for intelligent matching.

CREATE TABLE IF NOT EXISTS public.user_drive_index (
  id                           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                      UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  folder_id                    TEXT         NOT NULL,
  file_id                      TEXT         NOT NULL,           -- Drive file ID
  file_name                    TEXT         NOT NULL,
  file_name_normalized         TEXT,                            -- lowercase, no accents/symbols
  file_size                    BIGINT,
  mime_type                    TEXT         DEFAULT 'application/pdf',
  md5_checksum                 TEXT,                            -- Drive-provided checksum
  drive_modified_at            TIMESTAMPTZ,

  -- ── Extracted from PDF content ───────────────────────────────────────────
  linha_digitavel              TEXT,        -- 47-48 digit barcode sequence
  nosso_numero                 TEXT,        -- "Nosso Número" field
  cpf_cnpj                     TEXT,        -- stripped digits only
  client_name_extracted        TEXT,
  valor                        NUMERIC(12, 2),
  vencimento                   DATE,

  -- ── Indexing status ───────────────────────────────────────────────────────
  metadata_extracted           BOOLEAN      NOT NULL DEFAULT false,
  metadata_extraction_attempted BOOLEAN     NOT NULL DEFAULT false,

  -- ── Timestamps ───────────────────────────────────────────────────────────
  indexed_at                   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at                   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, file_id)
);

COMMENT ON TABLE public.user_drive_index IS 'Indexed Drive PDFs with extracted boleto metadata. Service-role write only.';

ALTER TABLE public.user_drive_index ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "udi_select_own" ON public.user_drive_index;
CREATE POLICY "udi_select_own"
  ON public.user_drive_index FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_udi_user_folder   ON public.user_drive_index (user_id, folder_id);
CREATE INDEX IF NOT EXISTS idx_udi_cpf_cnpj      ON public.user_drive_index (user_id, cpf_cnpj)  WHERE cpf_cnpj IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_udi_linha         ON public.user_drive_index (user_id, linha_digitavel) WHERE linha_digitavel IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_udi_md5           ON public.user_drive_index (md5_checksum)        WHERE md5_checksum IS NOT NULL;

-- ── 3. user_drive_index_log ───────────────────────────────────────────────────
--   Audit log for each indexing run.

CREATE TABLE IF NOT EXISTS public.user_drive_index_log (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  folder_id       TEXT         NOT NULL,
  files_found     INT          NOT NULL DEFAULT 0,
  files_indexed   INT          NOT NULL DEFAULT 0,
  files_skipped   INT          NOT NULL DEFAULT 0,  -- already up-to-date
  files_error     INT          NOT NULL DEFAULT 0,
  duration_ms     INT,
  status          TEXT         NOT NULL DEFAULT 'success',
  error_message   TEXT,
  metadata        JSONB        NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_drive_index_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "udil_select_own" ON public.user_drive_index_log;
CREATE POLICY "udil_select_own"
  ON public.user_drive_index_log FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_udil_user_created ON public.user_drive_index_log (user_id, created_at DESC);

-- ── 4. Backfill existing user_drive_match_logs with folder_id if missing ──────
--   The existing table had folder_id as TEXT (nullable). No structural change needed.

-- ── 5. Ensure drive_* columns exist on user_registros_financeiros ─────────────
--   (idempotent — the 2026-05-21 010000 migration already adds them)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'user_registros_financeiros'
      AND column_name  = 'drive_file_id'
  ) THEN
    ALTER TABLE public.user_registros_financeiros
      ADD COLUMN drive_file_id       TEXT,
      ADD COLUMN drive_file_name     TEXT,
      ADD COLUMN drive_file_url      TEXT,
      ADD COLUMN drive_match_score   NUMERIC(4, 3),
      ADD COLUMN drive_last_match_at TIMESTAMPTZ;
  END IF;
END;
$$;

-- Add confidence label column for auditing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'user_registros_financeiros'
      AND column_name  = 'drive_match_reason'
  ) THEN
    ALTER TABLE public.user_registros_financeiros
      ADD COLUMN drive_match_reason TEXT;
    COMMENT ON COLUMN public.user_registros_financeiros.drive_match_reason IS
      'Why this Drive file was matched: "document_exact", "linha_digitavel", "cpf_cnpj", "name_tokens", etc.';
  END IF;
END;
$$;
