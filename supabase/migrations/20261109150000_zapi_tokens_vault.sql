-- ─────────────────────────────────────────────────────────────────────────────
-- Tokens da Z-API no Supabase Vault — ETAPA 1 de 2
--
-- token e client_token (user_zapi_config e platform_integrations) ficavam em
-- texto puro. Quem visse o banco (painel, backup, dump) via os tokens e podia
-- mandar WhatsApp pelo número do cliente. Agora cada token também vai para o
-- Vault, criptografado com uma chave que fica fora do banco; a tabela guarda só
-- o id do segredo (token_secret_id / client_token_secret_id).
--
-- Gravação: a trigger zapi_tokens_para_vault copia para o Vault a cada
-- insert/update — o código que grava não muda.
-- Leitura: as Edge Functions abrem os tokens por zapi_abrir_segredos (só
-- service_role) e, se o Vault falhar, ainda usam o texto puro de reserva.
--
-- ETAPA 2 (outra migration, só depois de confirmar os envios): apaga o texto
-- puro e a trigger passa a não guardar mais nada na coluna.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists supabase_vault with schema vault;

alter table public.user_zapi_config
  add column if not exists token_secret_id        uuid,
  add column if not exists client_token_secret_id uuid;

alter table public.platform_integrations
  add column if not exists token_secret_id        uuid,
  add column if not exists client_token_secret_id uuid;

-- Grava (ou atualiza) um segredo pelo nome e devolve o id. Nome fixo por
-- conta/campo: rodar de novo não duplica.
create or replace function public.zapi_guardar_segredo(p_nome text, p_valor text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_valor is null or p_valor = '' then
    return null;
  end if;
  select s.id into v_id from vault.secrets s where s.name = p_nome;
  if v_id is null then
    v_id := vault.create_secret(p_valor, p_nome, 'Token Z-API (NC Finance)');
  else
    perform vault.update_secret(v_id, p_valor);
  end if;
  return v_id;
end;
$$;

revoke all on function public.zapi_guardar_segredo(text, text) from public, anon, authenticated, service_role;

-- Abre os tokens (só service_role, só segredos "zapi:"): usado pelas Edge
-- Functions na hora de enviar.
create or replace function public.zapi_abrir_segredos(p_ids uuid[])
returns table (id uuid, valor text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.decrypted_secret
  from vault.decrypted_secrets s
  where s.id = any (p_ids)
    and s.name like 'zapi:%';
$$;

revoke all on function public.zapi_abrir_segredos(uuid[]) from public, anon, authenticated;
grant execute on function public.zapi_abrir_segredos(uuid[]) to service_role;

-- Tokens que já existem → Vault.
update public.user_zapi_config set
  token_secret_id        = public.zapi_guardar_segredo('zapi:user_zapi_config:' || user_id::text || ':token', token),
  client_token_secret_id = public.zapi_guardar_segredo('zapi:user_zapi_config:' || user_id::text || ':client_token', client_token);

update public.platform_integrations set
  token_secret_id        = public.zapi_guardar_segredo('zapi:platform_integrations:' || provider || ':token', token),
  client_token_secret_id = public.zapi_guardar_segredo('zapi:platform_integrations:' || provider || ':client_token', client_token);

-- Gravações novas → Vault. tg_argv[0] = coluna que identifica a linha
-- (user_id ou provider); lida via jsonb porque as duas tabelas têm colunas
-- diferentes.
create or replace function public.zapi_tokens_para_vault()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base text := 'zapi:' || tg_table_name || ':' || (to_jsonb(new) ->> tg_argv[0]);
begin
  if tg_op = 'INSERT' or new.token is distinct from old.token then
    if coalesce(new.token, '') <> '' then
      new.token_secret_id := public.zapi_guardar_segredo(v_base || ':token', new.token);
    end if;
  end if;
  if tg_op = 'INSERT' or new.client_token is distinct from old.client_token then
    if coalesce(new.client_token, '') <> '' then
      new.client_token_secret_id := public.zapi_guardar_segredo(v_base || ':client_token', new.client_token);
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.zapi_tokens_para_vault() from public, anon, authenticated, service_role;

drop trigger if exists zapi_tokens_para_vault on public.user_zapi_config;
create trigger zapi_tokens_para_vault
  before insert or update on public.user_zapi_config
  for each row execute function public.zapi_tokens_para_vault('user_id');

drop trigger if exists zapi_tokens_para_vault on public.platform_integrations;
create trigger zapi_tokens_para_vault
  before insert or update on public.platform_integrations
  for each row execute function public.zapi_tokens_para_vault('provider');

-- Linha apagada (ex.: exclusão de conta) → segredo apagado. Falha aqui não
-- pode travar a exclusão da conta: vira só um aviso no log.
create or replace function public.zapi_apagar_segredos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    delete from vault.secrets
    where id in (old.token_secret_id, old.client_token_secret_id);
  exception when others then
    raise warning 'zapi_apagar_segredos: %', sqlerrm;
  end;
  return old;
end;
$$;

revoke all on function public.zapi_apagar_segredos() from public, anon, authenticated, service_role;

drop trigger if exists zapi_apagar_segredos on public.user_zapi_config;
create trigger zapi_apagar_segredos
  after delete on public.user_zapi_config
  for each row execute function public.zapi_apagar_segredos();

drop trigger if exists zapi_apagar_segredos on public.platform_integrations;
create trigger zapi_apagar_segredos
  after delete on public.platform_integrations
  for each row execute function public.zapi_apagar_segredos();

-- Conferência: toda linha com token deve ter o segredo igual ao texto puro.
-- "divergentes" e "sem_segredo" precisam dar 0.
select 'user_zapi_config' as tabela,
       count(*) filter (where z.token is not null and z.token <> '') as com_token,
       count(*) filter (where coalesce(z.token, '') <> '' and z.token_secret_id is null) as sem_segredo,
       count(*) filter (where s.decrypted_secret is distinct from z.token and z.token_secret_id is not null) as divergentes
from public.user_zapi_config z
left join vault.decrypted_secrets s on s.id = z.token_secret_id
union all
select 'platform_integrations',
       count(*) filter (where p.token is not null and p.token <> ''),
       count(*) filter (where coalesce(p.token, '') <> '' and p.token_secret_id is null),
       count(*) filter (where s.decrypted_secret is distinct from p.token and p.token_secret_id is not null)
from public.platform_integrations p
left join vault.decrypted_secrets s on s.id = p.token_secret_id;
