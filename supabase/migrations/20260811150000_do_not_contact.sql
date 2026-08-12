-- ═══════════════════════════════════════════════════════════════════════════
-- Lista "não contatar" (opt-out do devedor) — LGPD (direito de oposição) e
-- proteção do número de WhatsApp contra ban por reclamação de spam.
-- ═══════════════════════════════════════════════════════════════════════════
-- Chaveada por TELEFONE (normalizado, só dígitos), não por linha de devedor —
-- assim o opt-out persiste mesmo que o cliente reimporte o relatório e crie
-- novas linhas para o mesmo número.
--
-- Populada por:
--   • manual  — o usuário marca "não contatar" na tela
--   • reply   — o devedor respondeu "PARE/SAIR/..." (webhook whatsapp-inbound)
--
-- Toda rota de envio consulta esta lista antes de disparar.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.user_do_not_contact (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  phone       text        not null,                 -- normalizado (só dígitos)
  reason      text,
  source      text        not null default 'manual',-- 'manual' | 'reply'
  created_at  timestamptz not null default timezone('utc', now()),
  unique (user_id, phone)
);

create index if not exists idx_udnc_user_phone
  on public.user_do_not_contact (user_id, phone);

comment on table public.user_do_not_contact is
  'Lista não-contatar (opt-out) por telefone. Consultada antes de todo envio. Protege contra ban de WhatsApp e cumpre o direito de oposição da LGPD.';

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.user_do_not_contact enable row level security;

-- O usuário gerencia a própria lista (ver, adicionar, remover manualmente).
drop policy if exists "udnc_select_own" on public.user_do_not_contact;
create policy "udnc_select_own" on public.user_do_not_contact
  for select using (auth.uid() = user_id);

drop policy if exists "udnc_insert_own" on public.user_do_not_contact;
create policy "udnc_insert_own" on public.user_do_not_contact
  for insert with check (auth.uid() = user_id);

drop policy if exists "udnc_delete_own" on public.user_do_not_contact;
create policy "udnc_delete_own" on public.user_do_not_contact
  for delete using (auth.uid() = user_id);

-- O webhook (service_role) insere opt-outs automáticos ignorando RLS.
