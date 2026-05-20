create extension if not exists pgcrypto;

create table if not exists public.user_registros_financeiros (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_name text not null,
  supplier_name text not null default 'NC Finance',
  document_number text not null,
  due_date date not null,
  amount numeric(12,2) not null default 0,
  phone text,
  category text not null default 'vencidos',
  interest_applied numeric(8,2) default 0,
  fine_applied numeric(8,2) default 0,
  updated_value numeric(12,2),
  notes text,
  representative_id uuid,
  status text not null default 'pending',
  last_sent_message text,
  last_sent_date timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.user_representantes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  phone text not null,
  role text not null default 'Representante',
  color text not null default 'text-emerald-400 bg-emerald-500/10',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.user_logs_cobranca (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_name text not null,
  document_number text not null,
  phone text not null,
  amount numeric(12,2) not null default 0,
  sent_at timestamptz not null default timezone('utc', now()),
  tone text not null default 'neutro',
  message text not null,
  status text not null default 'sent',
  type text not null default 'manual',
  provider_message_id text,
  payload jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.user_configuracoes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  global_fine_pct numeric(8,2) not null default 2,
  global_interest_day_pct numeric(8,2) not null default 0.33,
  selected_tone text not null default 'amigavel',
  sheet_url_input text,
  drive_linked_folder text,
  subscription_status text not null default 'trialing',
  stripe_customer_id text,
  plan text not null default 'starter',
  usage_counters jsonb not null default '{"imports":0,"charges":0}'::jsonb,
  whatsapp_status text not null default 'not_configured',
  integration_provider text,
  last_connection_check timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.user_message_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  template_key text not null,
  name text not null,
  description text not null default '',
  template text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, template_key)
);

create table if not exists public.user_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  status text not null default 'not_configured',
  metadata jsonb not null default '{}'::jsonb,
  last_connection_check timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, provider)
);

alter table public.user_registros_financeiros enable row level security;
alter table public.user_representantes enable row level security;
alter table public.user_logs_cobranca enable row level security;
alter table public.user_configuracoes enable row level security;
alter table public.user_message_templates enable row level security;
alter table public.user_integrations enable row level security;

drop policy if exists "user_registros_financeiros_select_own" on public.user_registros_financeiros;
create policy "user_registros_financeiros_select_own"
on public.user_registros_financeiros for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "user_registros_financeiros_insert_own" on public.user_registros_financeiros;
create policy "user_registros_financeiros_insert_own"
on public.user_registros_financeiros for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists "user_registros_financeiros_update_own" on public.user_registros_financeiros;
create policy "user_registros_financeiros_update_own"
on public.user_registros_financeiros for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "user_registros_financeiros_delete_own" on public.user_registros_financeiros;
create policy "user_registros_financeiros_delete_own"
on public.user_registros_financeiros for delete to authenticated
using (auth.uid() = user_id);

drop policy if exists "user_representantes_select_own" on public.user_representantes;
create policy "user_representantes_select_own"
on public.user_representantes for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "user_representantes_insert_own" on public.user_representantes;
create policy "user_representantes_insert_own"
on public.user_representantes for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists "user_representantes_update_own" on public.user_representantes;
create policy "user_representantes_update_own"
on public.user_representantes for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "user_representantes_delete_own" on public.user_representantes;
create policy "user_representantes_delete_own"
on public.user_representantes for delete to authenticated
using (auth.uid() = user_id);

drop policy if exists "user_logs_cobranca_select_own" on public.user_logs_cobranca;
create policy "user_logs_cobranca_select_own"
on public.user_logs_cobranca for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "user_logs_cobranca_insert_own" on public.user_logs_cobranca;
create policy "user_logs_cobranca_insert_own"
on public.user_logs_cobranca for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists "user_logs_cobranca_update_own" on public.user_logs_cobranca;
create policy "user_logs_cobranca_update_own"
on public.user_logs_cobranca for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "user_logs_cobranca_delete_own" on public.user_logs_cobranca;
create policy "user_logs_cobranca_delete_own"
on public.user_logs_cobranca for delete to authenticated
using (auth.uid() = user_id);

drop policy if exists "user_configuracoes_select_own" on public.user_configuracoes;
create policy "user_configuracoes_select_own"
on public.user_configuracoes for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "user_configuracoes_insert_own" on public.user_configuracoes;
create policy "user_configuracoes_insert_own"
on public.user_configuracoes for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists "user_configuracoes_update_own" on public.user_configuracoes;
create policy "user_configuracoes_update_own"
on public.user_configuracoes for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "user_message_templates_select_own" on public.user_message_templates;
create policy "user_message_templates_select_own"
on public.user_message_templates for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "user_message_templates_insert_own" on public.user_message_templates;
create policy "user_message_templates_insert_own"
on public.user_message_templates for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists "user_message_templates_update_own" on public.user_message_templates;
create policy "user_message_templates_update_own"
on public.user_message_templates for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "user_message_templates_delete_own" on public.user_message_templates;
create policy "user_message_templates_delete_own"
on public.user_message_templates for delete to authenticated
using (auth.uid() = user_id);

drop policy if exists "user_integrations_select_own" on public.user_integrations;
create policy "user_integrations_select_own"
on public.user_integrations for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "user_integrations_insert_own" on public.user_integrations;
create policy "user_integrations_insert_own"
on public.user_integrations for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists "user_integrations_update_own" on public.user_integrations;
create policy "user_integrations_update_own"
on public.user_integrations for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "user_integrations_delete_own" on public.user_integrations;
create policy "user_integrations_delete_own"
on public.user_integrations for delete to authenticated
using (auth.uid() = user_id);

