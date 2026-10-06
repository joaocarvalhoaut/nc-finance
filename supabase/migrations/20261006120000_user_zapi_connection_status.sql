-- ─────────────────────────────────────────────────────────────────────────────
-- user_zapi_config — colunas de status de conexão
--
-- Até aqui o status da conexão (conectado, telefone, último erro) só existia em
-- platform_integrations, que é global. Com o número passando a ser exclusivo de
-- cada conta, cada linha de user_zapi_config precisa carregar o próprio status.
--
-- A partir desta migration o lookup em send-whatsapp-charge / send-whatsapp-batch
-- / process-dispatch-jobs é apenas:
--   1. user_zapi_config (número da conta)
-- O fallback para platform_integrations foi REMOVIDO: uma conta sem número
-- conectado não envia, em vez de disparar pelo número compartilhado da plataforma.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.user_zapi_config
  add column if not exists status                  text        not null default 'inactive',
  add column if not exists connected               boolean     not null default false,
  add column if not exists connected_pending_phone boolean     not null default false,
  add column if not exists phone_number            text,
  add column if not exists last_error              text;

comment on column public.user_zapi_config.status is
  'Estado da instância: active | inactive | testing | error.';

comment on column public.user_zapi_config.connected is
  'True quando a Z-API confirma o celular pareado nesta instância.';

comment on column public.user_zapi_config.connected_pending_phone is
  'True quando a instância está no ar aguardando leitura do QR Code.';

comment on column public.user_zapi_config.phone_number is
  'Telefone cru — mascarado antes de qualquer resposta ao frontend.';

comment on column public.user_zapi_config.last_error is
  'Último erro de conexão, já sanitizado. Nunca contém credencial.';

-- Índice para o lookup quente do envio (user_id + is_active).
create index if not exists user_zapi_config_user_active_idx
  on public.user_zapi_config (user_id)
  where is_active;
