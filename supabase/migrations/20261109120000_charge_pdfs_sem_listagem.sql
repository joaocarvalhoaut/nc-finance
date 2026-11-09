-- ─────────────────────────────────────────────────────────────────────────────
-- Boletos (bucket charge-pdfs): ninguém lista os arquivos dos outros
--
-- A política "charge_pdfs_select" liberava SELECT em storage.objects para
-- `public`. O link do boleto não precisa dela (bucket público: a URL
-- /object/public/... é servida sem passar pelo RLS), mas ela deixava qualquer
-- pessoa com a chave anon — que vai no front — LISTAR o bucket inteiro e
-- descobrir os boletos de todos os clientes.
--
-- Agora só o dono vê os próprios arquivos pela API (o upload com upsert
-- precisa do SELECT). O link enviado no WhatsApp continua funcionando.
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists "charge_pdfs_select" on storage.objects;

create policy "charge_pdfs_select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'charge-pdfs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
