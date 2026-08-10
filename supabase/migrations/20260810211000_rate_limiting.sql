-- ═══════════════════════════════════════════════════════════════════════════
-- Rate limiting de requisições — proteção contra spam, brute-force e sobrecarga
-- ═══════════════════════════════════════════════════════════════════════════
-- Edge Functions são stateless e distribuídas, então o contador precisa viver
-- no banco (não em memória do processo). Esta função faz janela-fixa atômica:
-- um único UPSERT por chamada (lookup por PK — barato), sem race condition.
--
-- A chave (bucket_key) é montada pelo chamador, tipicamente:
--   "<nome-da-função>:<user_id>"   → limite por usuário autenticado
--   "<nome-da-função>:ip:<ip>"     → limite por IP (webhooks/rotas públicas)
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.rate_limit_hits (
  bucket_key   text        primary key,
  window_start timestamptz not null,
  hits         int         not null default 0
);

-- Só o service_role (Edge Functions) acessa. RLS ligado sem policies = negado
-- para anon/authenticated; service_role ignora RLS. Nunca exposto ao cliente.
alter table public.rate_limit_hits enable row level security;

comment on table public.rate_limit_hits is
  'Contadores de rate limit por bucket (função+identidade). Uso interno das Edge Functions via check_rate_limit().';

-- ── Função atômica de verificação/incremento ────────────────────────────────
-- Retorna TRUE se a requisição está DENTRO do limite (permitida), FALSE se
-- excedeu. Reinicia o contador quando a janela vira.
create or replace function public.check_rate_limit(
  p_key            text,
  p_max            int,
  p_window_seconds int
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now          timestamptz := now();
  v_window_start timestamptz;
  v_hits         int;
begin
  -- Início da janela atual (alinhado a múltiplos de p_window_seconds)
  v_window_start := to_timestamp(
    floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds
  );

  insert into public.rate_limit_hits as r (bucket_key, window_start, hits)
    values (p_key, v_window_start, 1)
  on conflict (bucket_key) do update
    set hits = case
                 when r.window_start = v_window_start then r.hits + 1
                 else 1
               end,
        window_start = v_window_start
  returning r.hits into v_hits;

  return v_hits <= p_max;
end;
$$;

revoke all on function public.check_rate_limit(text, int, int) from public, anon, authenticated;

-- ── Limpeza opcional de janelas antigas ─────────────────────────────────────
-- A tabela é auto-limitada (uma linha por bucket, sobrescrita), mas buckets de
-- IPs efêmeros podem acumular. Esta função pode ser chamada por um cron leve.
create or replace function public.purge_stale_rate_limits(p_older_than_seconds int default 3600)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_deleted int;
begin
  delete from public.rate_limit_hits
   where window_start < now() - make_interval(secs => p_older_than_seconds);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.purge_stale_rate_limits(int) from public, anon, authenticated;
