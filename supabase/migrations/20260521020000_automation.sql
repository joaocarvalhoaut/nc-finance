-- Fase Automação: regras, fila de jobs e histórico de execuções

create extension if not exists pgcrypto;

-- ─── 1. Regras de automação por usuário ──────────────────────────────────────
create table if not exists public.user_automation_rules (
  id                 uuid        primary key default gen_random_uuid(),
  user_id            uuid        not null references auth.users(id) on delete cascade,
  name               text        not null,
  enabled            boolean     not null default true,
  rule_type          text        not null,   -- overdue | due_today | due_in_days
  days_before_due    integer,                -- usado em due_in_days
  message_tone       text        not null default 'neutro',
  custom_message     text,
  send_window_start  time,                   -- ex: '08:00:00' (Premium)
  send_window_end    time,                   -- ex: '20:00:00' (Premium)
  max_daily_sends    integer,                -- limite diário opcional (Premium)
  last_run_at        timestamptz,
  next_run_at        timestamptz,
  created_at         timestamptz not null default timezone('utc', now()),
  updated_at         timestamptz not null default timezone('utc', now())
);

-- ─── 2. Fila de jobs de disparo ───────────────────────────────────────────────
create table if not exists public.user_dispatch_jobs (
  id                   uuid        primary key default gen_random_uuid(),
  user_id              uuid        not null references auth.users(id) on delete cascade,
  automation_rule_id   uuid        references public.user_automation_rules(id) on delete set null,
  debtor_id            uuid        not null,
  status               text        not null default 'queued',
  -- queued | processing | success | failed | retrying | skipped | duplicated | blocked_limit | blocked_subscription
  scheduled_for        timestamptz not null default timezone('utc', now()),
  attempts             integer     not null default 0,
  max_attempts         integer     not null default 3,
  last_error           text,
  provider_message_id  text,
  metadata             jsonb       not null default '{}'::jsonb,
  created_at           timestamptz not null default timezone('utc', now()),
  updated_at           timestamptz not null default timezone('utc', now())
);

-- ─── 3. Histórico de execuções do scheduler ───────────────────────────────────
create table if not exists public.user_automation_runs (
  id                   uuid        primary key default gen_random_uuid(),
  user_id              uuid        not null references auth.users(id) on delete cascade,
  automation_rule_id   uuid        references public.user_automation_rules(id) on delete set null,
  status               text        not null default 'running',  -- running | success | error | partial
  total_candidates     integer     not null default 0,
  jobs_created         integer     not null default 0,
  jobs_skipped         integer     not null default 0,
  sent                 integer     not null default 0,
  failed               integer     not null default 0,
  metadata             jsonb       not null default '{}'::jsonb,
  started_at           timestamptz not null default timezone('utc', now()),
  finished_at          timestamptz
);

-- ─── 4. RLS ───────────────────────────────────────────────────────────────────
alter table public.user_automation_rules enable row level security;
alter table public.user_dispatch_jobs    enable row level security;
alter table public.user_automation_runs  enable row level security;

-- Rules: usuário gerencia suas próprias regras
drop policy if exists "uar_select_own" on public.user_automation_rules;
create policy "uar_select_own"
  on public.user_automation_rules for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "uar_insert_own" on public.user_automation_rules;
create policy "uar_insert_own"
  on public.user_automation_rules for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "uar_update_own" on public.user_automation_rules;
create policy "uar_update_own"
  on public.user_automation_rules for update to authenticated
  using (auth.uid() = user_id);

drop policy if exists "uar_delete_own" on public.user_automation_rules;
create policy "uar_delete_own"
  on public.user_automation_rules for delete to authenticated
  using (auth.uid() = user_id);

-- Jobs: usuário lê apenas (escrita pelo service role via cron)
drop policy if exists "udj_select_own" on public.user_dispatch_jobs;
create policy "udj_select_own"
  on public.user_dispatch_jobs for select to authenticated
  using (auth.uid() = user_id);

-- Runs: usuário lê apenas
drop policy if exists "uarun_select_own" on public.user_automation_runs;
create policy "uarun_select_own"
  on public.user_automation_runs for select to authenticated
  using (auth.uid() = user_id);

-- ─── 5. Índices ───────────────────────────────────────────────────────────────
create index if not exists idx_uar_user_enabled
  on public.user_automation_rules (user_id, enabled, next_run_at);

create index if not exists idx_udj_status_scheduled
  on public.user_dispatch_jobs (status, scheduled_for)
  where status in ('queued', 'retrying');

create index if not exists idx_udj_rule_debtor
  on public.user_dispatch_jobs (automation_rule_id, debtor_id, created_at desc);

create index if not exists idx_uarun_rule_started
  on public.user_automation_runs (automation_rule_id, started_at desc);

-- ─── 6. pg_cron (documentação — requer extensão pg_cron habilitada) ───────────
-- Para habilitar no Supabase: Dashboard → Database → Extensions → pg_cron
-- Depois de deploy das Edge Functions e configuração de AUTOMATION_CRON_SECRET:
--
-- SELECT cron.schedule(
--   'nc-finance-scheduler',
--   '0 8 * * *',
--   $$SELECT net.http_post(
--     url    := 'https://<PROJECT_REF>.supabase.co/functions/v1/run-automation-scheduler',
--     headers:= '{"Authorization":"Bearer <AUTOMATION_CRON_SECRET>","Content-Type":"application/json"}'::jsonb,
--     body   := '{}'::jsonb
--   )$$
-- );
--
-- SELECT cron.schedule(
--   'nc-finance-worker',
--   '*/5 * * * *',
--   $$SELECT net.http_post(
--     url    := 'https://<PROJECT_REF>.supabase.co/functions/v1/process-dispatch-jobs',
--     headers:= '{"Authorization":"Bearer <AUTOMATION_CRON_SECRET>","Content-Type":"application/json"}'::jsonb,
--     body   := '{}'::jsonb
--   )$$
-- );
