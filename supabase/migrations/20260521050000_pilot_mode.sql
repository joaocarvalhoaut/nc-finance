-- ─────────────────────────────────────────────────────────────────────────────
-- pilot_mode — controlled-pilot tables
--
-- pilot_config : one row per user/tenant.
--   • pilot_enabled     — only users with this flag can send.
--   • daily_send_limit  — max sends per calendar day.
--   • allowed_send_start / allowed_send_end — HH:MM window (UTC).
--   • allowed_weekdays  — array of ISO weekday ints 1=Mon … 7=Sun.
--
-- pilot_daily_sends : rolling counter, one row per (user, date).
--   Incremented by Edge Functions after each successful send.
--
-- pilot_fallback_notes : manually recorded resolutions for failed sends.
--   Audit trail for the "resolve manually" flow.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. pilot_config ──────────────────────────────────────────────────────────

create table if not exists pilot_config (
  id                  uuid        primary key default gen_random_uuid(),
  user_id             uuid        not null references auth.users (id) on delete cascade,
  pilot_enabled       boolean     not null default false,
  daily_send_limit    integer     not null default 20
                                  check (daily_send_limit > 0 and daily_send_limit <= 500),
  -- HH:MM strings (UTC) — e.g. '08:00' / '18:00'
  allowed_send_start  text        not null default '08:00',
  allowed_send_end    text        not null default '18:00',
  -- ISO weekdays: 1=Mon … 7=Sun
  allowed_weekdays    integer[]   not null default '{1,2,3,4,5}',
  -- Human-readable labels for the ops checklist
  whatsapp_number_label   text,     -- e.g. "(77) 9 8137-6867 — Empresa XPTO"
  responsible_name        text,     -- internal contact name
  support_channel         text,     -- e.g. "slack:#whatsapp-pilot"
  notes                   text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (user_id)
);

comment on table  pilot_config                     is 'Per-tenant pilot-mode settings. pilot_enabled must be true to send via WhatsApp.';
comment on column pilot_config.daily_send_limit    is 'Max WhatsApp sends per calendar day for this tenant.';
comment on column pilot_config.allowed_send_start  is 'Start of allowed send window (UTC HH:MM).';
comment on column pilot_config.allowed_send_end    is 'End of allowed send window (UTC HH:MM).';
comment on column pilot_config.allowed_weekdays    is 'ISO weekday numbers (1=Mon … 7=Sun) when sends are allowed.';

-- ── RLS ────────────────────────────────────────────────────────────────────────

alter table pilot_config enable row level security;

-- Users can read their own config
create policy "pilot_config_select_own"
  on pilot_config for select
  using (auth.uid() = user_id);

-- Users can update their own config (label / notes only — pilot_enabled must be set by admin/service role)
create policy "pilot_config_update_own"
  on pilot_config for update
  using (auth.uid() = user_id);

-- service_role can do anything (no policy needed — bypasses RLS)

-- ── Updated-at trigger ────────────────────────────────────────────────────────

create or replace function pilot_config_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger pilot_config_updated_at
  before update on pilot_config
  for each row execute procedure pilot_config_set_updated_at();

-- ── Index ──────────────────────────────────────────────────────────────────────

create index if not exists idx_pilot_config_user_id on pilot_config (user_id);

-- ── 2. pilot_daily_sends ─────────────────────────────────────────────────────

create table if not exists pilot_daily_sends (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users (id) on delete cascade,
  send_date   date        not null default current_date,
  sent_count  integer     not null default 0 check (sent_count >= 0),
  updated_at  timestamptz not null default now(),
  unique (user_id, send_date)
);

comment on table pilot_daily_sends is 'Rolling daily send counter per tenant — enforces pilot_config.daily_send_limit.';

-- ── RLS ────────────────────────────────────────────────────────────────────────

alter table pilot_daily_sends enable row level security;

-- Users can read their own counters
create policy "pilot_daily_sends_select_own"
  on pilot_daily_sends for select
  using (auth.uid() = user_id);

-- ── Index ──────────────────────────────────────────────────────────────────────

create index if not exists idx_pilot_daily_sends_user_date
  on pilot_daily_sends (user_id, send_date);

-- ── 3. pilot_fallback_notes ──────────────────────────────────────────────────

create table if not exists pilot_fallback_notes (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users (id) on delete cascade,
  log_id          uuid        references user_logs_cobranca (id) on delete set null,
  client_name     text        not null,
  document_number text,
  -- phone stored masked only
  phone_masked    text,
  resolution      text        not null
                              check (resolution in ('resolvido_manualmente','reenviado','ignorado','contato_direto')),
  observation     text,       -- operator notes (free text)
  resolved_at     timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

comment on table  pilot_fallback_notes             is 'Audit trail for manually resolved WhatsApp send failures.';
comment on column pilot_fallback_notes.phone_masked is 'Masked phone number — raw phone is never stored here.';

-- ── RLS ────────────────────────────────────────────────────────────────────────

alter table pilot_fallback_notes enable row level security;

create policy "pilot_fallback_notes_select_own"
  on pilot_fallback_notes for select
  using (auth.uid() = user_id);

create policy "pilot_fallback_notes_insert_own"
  on pilot_fallback_notes for insert
  with check (auth.uid() = user_id);

-- ── Index ──────────────────────────────────────────────────────────────────────

create index if not exists idx_pilot_fallback_notes_user_id
  on pilot_fallback_notes (user_id, created_at desc);
