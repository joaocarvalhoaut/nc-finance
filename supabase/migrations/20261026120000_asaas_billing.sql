-- ─────────────────────────────────────────────────────────────────────────────
-- Cobrança da assinatura pelo Asaas (substitui a Stripe)
--
-- user_subscriptions continua sendo a fonte do acesso: mesmo status (trialing,
-- active, past_due, canceled, incomplete), agora sincronizado a partir do Asaas.
-- As colunas stripe_* ficam para o histórico das contas de teste.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.user_subscriptions
  add column if not exists billing_provider      text not null default 'stripe',
  add column if not exists asaas_customer_id     text,
  add column if not exists asaas_subscription_id text;

-- O webhook encontra a conta pelo id da assinatura.
create unique index if not exists user_subscriptions_asaas_subscription_id_key
  on public.user_subscriptions (asaas_subscription_id)
  where asaas_subscription_id is not null;

-- Eventos já processados: o Asaas entrega "pelo menos uma vez" e reenvia com
-- o mesmo id.
create table if not exists public.asaas_webhook_events (
  event_id     text primary key,
  event_type   text not null,
  processed_at timestamptz not null default timezone('utc', now())
);

-- Só o service_role (Edge Functions) acessa. RLS ligada e sem policy = nenhum
-- acesso pelo front.
alter table public.asaas_webhook_events enable row level security;
