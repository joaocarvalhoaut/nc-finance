-- ─────────────────────────────────────────────────────────────────────────────
-- platform_integrations — global provider credentials (service-role only)
--
-- This table stores platform-level integration credentials.
-- Row-level security is ENABLED but no policies are granted to anon or
-- authenticated roles, so only the service_role (Edge Functions) can read
-- or write rows.  The browser NEVER queries this table directly.
--
-- Frontend receives only: status, connected, connected_pending_phone,
-- phone_number_masked, updated_at — returned by the whatsapp-gateway
-- Edge Function after stripping all secrets.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists platform_integrations (
  id                       uuid        primary key default gen_random_uuid(),
  provider                 text        not null unique,  -- 'zapi'
  instance_id              text,                         -- Z-API instance ID
  token                    text,                         -- Z-API token (sensitive)
  client_token             text,                         -- Z-API client-token (sensitive)
  status                   text        not null default 'inactive',
    -- 'active' | 'inactive' | 'testing' | 'error'
  connected                boolean     not null default false,
  connected_pending_phone  boolean     not null default false,
  phone_number             text,       -- raw phone (service-role only)
  last_error               text,       -- sanitized last connection error
  updated_at               timestamptz not null default now()
);

comment on table  platform_integrations is 'Global provider credentials — service_role access only, never exposed to browser.';
comment on column platform_integrations.token        is 'Sensitive — never returned to frontend.';
comment on column platform_integrations.client_token is 'Sensitive — never returned to frontend.';
comment on column platform_integrations.phone_number is 'Raw phone — masked before any frontend response.';

-- ── RLS: block all direct browser access ──────────────────────────────────────
alter table platform_integrations enable row level security;

-- No policies = no access for anon / authenticated roles.
-- service_role bypasses RLS by default in Supabase.

-- ── Index ─────────────────────────────────────────────────────────────────────
create index if not exists idx_platform_integrations_provider
  on platform_integrations (provider);

-- ── Seed: ensure a 'zapi' row always exists (inactive by default) ─────────────
insert into platform_integrations (provider, status, connected)
values ('zapi', 'inactive', false)
on conflict (provider) do nothing;
