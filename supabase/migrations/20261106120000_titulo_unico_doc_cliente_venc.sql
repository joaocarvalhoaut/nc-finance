-- Mesmo título = mesmo documento + mesmo cliente + mesmo vencimento.
--
-- Antes a chave era só (user_id, document_number): o mesmo número de documento
-- em outro cliente ou com outro vencimento (parcelas) era tratado como
-- duplicado, e a reimportação sobrescrevia o título do outro cliente.
-- A importação (financeService.createMany) faz upsert nesta chave nova; antes
-- desta migration ela cai na chave antiga.
--
-- Os dados atuais já são únicos por (user_id, document_number), então também
-- são únicos pela chave nova — nada é apagado.

alter table public.user_registros_financeiros
  drop constraint if exists uq_urf_user_document;

alter table public.user_registros_financeiros
  add constraint uq_urf_user_doc_cliente_venc
  unique (user_id, document_number, client_name, due_date);

comment on constraint uq_urf_user_doc_cliente_venc
  on public.user_registros_financeiros is
  'Um título por (user_id, document_number, client_name, due_date). Necessária para o upsert (onConflict) da importação.';
