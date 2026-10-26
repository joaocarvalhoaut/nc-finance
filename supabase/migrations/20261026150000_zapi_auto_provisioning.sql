-- ─────────────────────────────────────────────────────────────────────────────
-- Instância Z-API criada automaticamente para cada conta (API de parceiro)
--
-- O cliente clica em "Conectar WhatsApp" e o NC Finance cria a instância dele.
-- Estas colunas guardam o ciclo de vida, para assinar quando o número conecta e
-- cancelar quando a assinatura do NC Finance acaba (zapiProvisioning.ts).
-- Instâncias cadastradas à mão pelo suporte ficam com auto_provisioned = false
-- e não são tocadas.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.user_zapi_config
  add column if not exists auto_provisioned boolean     not null default false,
  add column if not exists provisioned_at   timestamptz,
  add column if not exists subscribed_at    timestamptz,
  add column if not exists canceled_at      timestamptz;

-- Verificação diária: só as automáticas ativas.
create index if not exists user_zapi_config_auto_active_idx
  on public.user_zapi_config (user_id)
  where auto_provisioned and is_active;
