-- Fase Z-API: adiciona colunas necessárias para logs reais de envio WhatsApp
-- Idempotente: usa "if not exists" via DO block

do $$
begin
  -- provider (ex: 'zapi', 'mock')
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'user_logs_cobranca'
      and column_name  = 'provider'
  ) then
    alter table public.user_logs_cobranca add column provider text default 'mock';
  end if;

  -- error_message: razão do erro quando status != sucesso
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'user_logs_cobranca'
      and column_name  = 'error_message'
  ) then
    alter table public.user_logs_cobranca add column error_message text;
  end if;

  -- idempotency_key: hash SHA-256 para evitar duplicidade de envio
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'user_logs_cobranca'
      and column_name  = 'idempotency_key'
  ) then
    alter table public.user_logs_cobranca add column idempotency_key text;
  end if;

  -- debtor_id: referência ao registro financeiro, se disponível
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'user_logs_cobranca'
      and column_name  = 'debtor_id'
  ) then
    alter table public.user_logs_cobranca add column debtor_id uuid;
  end if;
end$$;

-- Índice para busca de duplicatas por chave de idempotência
create index if not exists idx_ulc_idempotency_key
  on public.user_logs_cobranca (user_id, idempotency_key, status)
  where idempotency_key is not null;
