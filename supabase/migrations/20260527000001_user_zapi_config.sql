-- ─────────────────────────────────────────────────────────────────────────────
-- user_zapi_config
-- Armazena credenciais Z-API individuais para clientes que contrataram
-- o add-on "Número Próprio". Preenchido manualmente pelo suporte NC Finance
-- após a criação da instância Z-API dedicada ao cliente.
--
-- Lookup order em send-whatsapp-charge / send-whatsapp-batch:
--   1. user_zapi_config  (número próprio do cliente)
--   2. platform_integrations  (número global NC Finance — fallback)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.user_zapi_config (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users(id) on delete cascade,
  instance_id     text        not null,
  token           text        not null,
  client_token    text        not null,
  label           text,                        -- ex: "WhatsApp João Silva"
  is_active       boolean     not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint user_zapi_config_user_id_key unique (user_id)
);

-- RLS: apenas service_role pode ler/escrever (credenciais nunca chegam ao frontend)
alter table public.user_zapi_config enable row level security;

-- Nenhuma policy para roles autenticados — somente service_role bypassa RLS
-- O suporte insere via Supabase Dashboard (service_role) ou via script seguro

comment on table public.user_zapi_config is
  'Credenciais Z-API por usuário para o add-on de número próprio. '
  'Populado pelo suporte NC Finance após contratação. '
  'Somente acessível por service_role — nunca exposto ao frontend.';

comment on column public.user_zapi_config.label is
  'Rótulo livre para identificação interna, ex: "WhatsApp principal da empresa X".';
