-- ─────────────────────────────────────────────────────────────────────────────
-- Tokens da Z-API no Supabase Vault — ETAPA 2 de 2
--
-- Rodar só depois da etapa 1 (20261109150000) e de um envio de teste ter saído.
-- Apaga o texto puro de token/client_token: daqui em diante o Vault é a única
-- fonte. A trigger passa a guardar no Vault e limpar a coluna a cada gravação
-- (o código que grava continua igual).
--
-- Se algum token não estiver no Vault ou não bater com o texto puro, a
-- migration para com erro antes de apagar qualquer coisa.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
begin
  -- As Edge Functions (service_role) precisam conseguir abrir os tokens, e a
  -- função precisa devolver o mesmo valor do texto puro.
  if not has_function_privilege('service_role', 'public.zapi_abrir_segredos(uuid[])', 'execute') then
    raise exception 'service_role não consegue executar zapi_abrir_segredos. Nada foi apagado.';
  end if;
  if exists (
    select 1 from public.user_zapi_config z
    where z.token_secret_id is not null
      and (select a.valor from public.zapi_abrir_segredos(array[z.token_secret_id]) a) is distinct from z.token
  ) then
    raise exception 'zapi_abrir_segredos não devolve o token certo. Nada foi apagado.';
  end if;

  if exists (
    select 1 from public.user_zapi_config z
    left join vault.decrypted_secrets t on t.id = z.token_secret_id
    left join vault.decrypted_secrets c on c.id = z.client_token_secret_id
    where (coalesce(z.token, '') <> '' and t.decrypted_secret is distinct from z.token)
       or (coalesce(z.client_token, '') <> '' and c.decrypted_secret is distinct from z.client_token)
  ) or exists (
    select 1 from public.platform_integrations p
    left join vault.decrypted_secrets t on t.id = p.token_secret_id
    left join vault.decrypted_secrets c on c.id = p.client_token_secret_id
    where (coalesce(p.token, '') <> '' and t.decrypted_secret is distinct from p.token)
       or (coalesce(p.client_token, '') <> '' and c.decrypted_secret is distinct from p.client_token)
  ) then
    raise exception 'Há token fora do Vault ou diferente do texto puro. Nada foi apagado — rode de novo a etapa 1.';
  end if;
end;
$$;

-- As colunas em texto puro passam a ficar vazias.
alter table public.user_zapi_config
  alter column token        drop not null,
  alter column client_token drop not null;

-- Trigger: guarda no Vault, garante o id do segredo e limpa o texto puro.
-- O id é procurado pelo nome quando falta: num upsert (insert ... on conflict
-- do update) o id calculado no insert não chega à linha atualizada.
create or replace function public.zapi_tokens_para_vault()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base text := 'zapi:' || tg_table_name || ':' || (to_jsonb(new) ->> tg_argv[0]);
begin
  if coalesce(new.token, '') <> '' then
    new.token_secret_id := public.zapi_guardar_segredo(v_base || ':token', new.token);
  elsif new.token_secret_id is null then
    select s.id into new.token_secret_id from vault.secrets s where s.name = v_base || ':token';
  end if;

  if coalesce(new.client_token, '') <> '' then
    new.client_token_secret_id := public.zapi_guardar_segredo(v_base || ':client_token', new.client_token);
  elsif new.client_token_secret_id is null then
    select s.id into new.client_token_secret_id from vault.secrets s where s.name = v_base || ':client_token';
  end if;

  new.token := null;
  new.client_token := null;
  return new;
end;
$$;

revoke all on function public.zapi_tokens_para_vault() from public, anon, authenticated, service_role;

-- Apaga o texto puro do que já existe (a trigger acima faz o resto).
update public.user_zapi_config set token = null, client_token = null;
update public.platform_integrations set token = null, client_token = null;

-- Conferência: "texto_puro" precisa dar 0 e "no_vault" igual ao total de linhas com instância.
select 'user_zapi_config' as tabela,
       count(*) as linhas,
       count(*) filter (where coalesce(token, '') <> '' or coalesce(client_token, '') <> '') as texto_puro,
       count(*) filter (where token_secret_id is not null) as no_vault
from public.user_zapi_config
union all
select 'platform_integrations',
       count(*),
       count(*) filter (where coalesce(token, '') <> '' or coalesce(client_token, '') <> ''),
       count(*) filter (where token_secret_id is not null)
from public.platform_integrations;
