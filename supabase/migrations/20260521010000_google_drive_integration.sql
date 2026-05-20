-- Fase Google Drive: colunas de match e tabela de logs

-- ─── 1. Colunas drive_* em user_registros_financeiros ────────────────────────
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'user_registros_financeiros'
      and column_name  = 'drive_file_id'
  ) then
    alter table public.user_registros_financeiros
      add column drive_file_id      text,
      add column drive_file_name    text,
      add column drive_file_url     text,
      add column drive_match_score  numeric(4,3),
      add column drive_last_match_at timestamptz;
  end if;
end$$;

-- ─── 2. Tabela de logs de match ───────────────────────────────────────────────
create table if not exists public.user_drive_match_logs (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users(id) on delete cascade,
  folder_id       text,
  files_found     integer     not null default 0,
  debtors_matched integer     not null default 0,
  debtors_total   integer     not null default 0,
  status          text        not null default 'success',
  error_message   text,
  metadata        jsonb       not null default '{}'::jsonb,
  created_at      timestamptz not null default timezone('utc', now())
);

-- ─── 3. RLS ───────────────────────────────────────────────────────────────────
alter table public.user_drive_match_logs enable row level security;

drop policy if exists "udml_select_own" on public.user_drive_match_logs;
create policy "udml_select_own"
  on public.user_drive_match_logs for select to authenticated
  using (auth.uid() = user_id);

-- ─── 4. Índices ───────────────────────────────────────────────────────────────
create index if not exists idx_udml_user_created
  on public.user_drive_match_logs (user_id, created_at desc);

create index if not exists idx_urf_drive_file_id
  on public.user_registros_financeiros (drive_file_id)
  where drive_file_id is not null;
