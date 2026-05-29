-- ─── charge-pdfs Storage bucket + RLS ───────────────────────────────────────
--
-- Cria (ou ajusta) o bucket "charge-pdfs" como PÚBLICO para que:
--   1. O frontend (cliente autenticado) possa fazer upload de PDFs de boleto.
--   2. A Z-API possa baixar o arquivo via URL pública sem token.
--
-- Políticas:
--   INSERT  → apenas o dono da pasta (auth.uid() = primeiro segmento do path)
--   SELECT  → público (necessário para Z-API buscar o arquivo via URL)
--   UPDATE  → apenas o dono (upsert)
--   DELETE  → apenas o dono
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Cria o bucket (ou garante que é público se já existir)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'charge-pdfs',
  'charge-pdfs',
  true,
  10485760,             -- 10 MB
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE
  SET public            = true,
      file_size_limit   = 10485760,
      allowed_mime_types = ARRAY['application/pdf'];

-- 2. Remove políticas antigas (idempotência)
DROP POLICY IF EXISTS "charge_pdfs_insert"  ON storage.objects;
DROP POLICY IF EXISTS "charge_pdfs_select"  ON storage.objects;
DROP POLICY IF EXISTS "charge_pdfs_update"  ON storage.objects;
DROP POLICY IF EXISTS "charge_pdfs_delete"  ON storage.objects;

-- 3. INSERT: apenas usuário autenticado cujo UUID corresponde ao 1º segmento do path
--    Ex.: path = "{userId}/{debtorId}/boleto.pdf" → segmento [1] = userId
CREATE POLICY "charge_pdfs_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'charge-pdfs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 4. SELECT: público (leitura pública para Z-API + outros clientes)
CREATE POLICY "charge_pdfs_select"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'charge-pdfs');

-- 5. UPDATE: apenas o dono (upsert de re-upload)
CREATE POLICY "charge_pdfs_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'charge-pdfs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'charge-pdfs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 6. DELETE: apenas o dono
CREATE POLICY "charge_pdfs_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'charge-pdfs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
