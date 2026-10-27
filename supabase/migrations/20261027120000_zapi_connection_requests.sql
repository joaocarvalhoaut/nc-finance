-- ─────────────────────────────────────────────────────────────────────────────
-- Pedidos de conexão de WhatsApp aguardando instância
--
-- Enquanto a criação automática de instâncias (programa Partner da Z-API) não
-- está ativa, o cliente que clica em "Conectar WhatsApp" sem instância vira um
-- pedido aqui. O suporte vê a lista no cartão do WhatsApp, liga uma instância
-- à conta e o pedido é marcado como atendido.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.zapi_connection_requests (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  email        text,
  requested_at timestamptz not null default timezone('utc', now()),
  notified_at  timestamptz,
  fulfilled_at timestamptz
);

create index if not exists zapi_connection_requests_pending_idx
  on public.zapi_connection_requests (requested_at)
  where fulfilled_at is null;

-- Só o service_role (Edge Functions) acessa. RLS ligada e sem policy = nenhum
-- acesso pelo front.
alter table public.zapi_connection_requests enable row level security;
