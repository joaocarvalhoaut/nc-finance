-- ─────────────────────────────────────────────────────────────────────────────
-- Proteção do número: limite diário de mensagens e aquecimento de número novo
--
-- Vale para todo envio (um por um, lote e automação), em qualquer plano.
-- Regras em supabase/functions/_shared/protecaoNumero.ts; leitura no servidor
-- em _shared/limiteDiario.ts; ajuste em Configurações › Proteção do número.
--
--   limite_diario_envios — teto de mensagens por dia escolhido pelo usuário
--                          (null = sem teto próprio).
--   aquecimento_ativo    — nos primeiros 30 dias o teto sobe aos poucos.
--   aquecimento_inicio   — dia 1 do aquecimento (gravado no primeiro envio).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.user_configuracoes
  add column if not exists limite_diario_envios integer
    check (limite_diario_envios is null or (limite_diario_envios between 1 and 2000)),
  add column if not exists aquecimento_ativo  boolean not null default true,
  add column if not exists aquecimento_inicio date;

comment on column public.user_configuracoes.limite_diario_envios is
  'Teto de mensagens por dia (todas as formas de envio). Null = sem teto próprio.';
comment on column public.user_configuracoes.aquecimento_ativo is
  'Aquecimento de número novo: nos primeiros 30 dias o teto diário sobe aos poucos.';
comment on column public.user_configuracoes.aquecimento_inicio is
  'Dia 1 do aquecimento (data de Brasília). Gravado no primeiro envio.';

-- Contas que já enviam: o aquecimento conta a partir do primeiro envio que
-- deu certo — quem já usa há mais de 30 dias não ganha trava nova.
insert into public.user_configuracoes (user_id, aquecimento_inicio)
select l.user_id, min((l.sent_at at time zone 'America/Sao_Paulo')::date)
from public.user_logs_cobranca l
where l.status in ('sucesso', 'sent', 'recebido', 'entregue', 'lido')
group by l.user_id
on conflict (user_id) do update
  set aquecimento_inicio = excluded.aquecimento_inicio
  where public.user_configuracoes.aquecimento_inicio is null;
