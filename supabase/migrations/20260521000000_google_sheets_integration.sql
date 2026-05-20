-- Fase Google Sheets: tabelas de config/log e coluna import_source

create extension if not exists pgcrypto;

-- ─── 1. Configuração de planilha por usuário ─────────────────────────────────
create table if not exists public.user_google_sheets_config (
  id                 uuid        primary key default gen_random_uuid(),
  user_id            uuid        not null references auth.users(id) on delete cascade,
  spreadsheet_id     text,
  spreadsheet_url    text,
  sheet_name         text,
  last_sync_at       timestamptz,
  last_sync_status   text,
  last_sync_error    text,
  created_at         timestamptz not null default timezone('utc', now()),
  updated_at         timestamptz not null default timezone('utc', now()),
  unique (user_id)
);

-- ─── 2. Log de importações ────────────────────────────────────────────────────
create table if not exists public.user_import_logs (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users(id) on delete cascade,
  provider        text        not null default 'google_sheets',
  status          text        not null default 'success',
  rows_total      integer     not null default 0,
  rows_imported   integer     not null default 0,
  rows_skipped    integer     not null default 0,
  error_message   text,
  metadata        jsonb       not null default '{}'::jsonb,
  created_at      timestamptz not null default timezone('utc', now())
);

-- ─── 3. Coluna import_source em user_registros_financeiros ───────────────────
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'user_registros_financeiros'
      and column_name  = 'import_source'
  ) then
    alter table public.user_registros_financeiros
      add column import_source text default 'manual';
  end if;
end$$;

-- ─── 4. RLS ───────────────────────────────────────────────────────────────────
alter table public.user_google_sheets_config enable row level security;
alter table public.user_import_logs          enable row level security;

drop policy if exists "ugsc_select_own" on public.user_google_sheets_config;
create policy "ugsc_select_own"
  on public.user_google_sheets_config for select to authenticated
  using (auth.uid() = user_id);

-- Escrita de config é feita pelo backend (service role) — frontend só lê
drop policy if exists "uil_select_own" on public.user_import_logs;
create policy "uil_select_own"
  on public.user_import_logs for select to authenticated
  using (auth.uid() = user_id);

-- ─── 5. Índice para logs recentes por usuário ─────────────────────────────────
create index if not exists idx_uil_user_created
  on public.user_import_logs (user_id, created_at desc);
