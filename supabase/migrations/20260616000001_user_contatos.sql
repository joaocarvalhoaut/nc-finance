-- Cadastro persistente de contatos por cliente.
-- Acumula telefone / observações já preenchidos para SUGERIR (não auto-preencher)
-- o preenchimento em importações e cadastros manuais futuros.
-- Chave de casamento: nome do cliente normalizado (contact_key).

create table if not exists public.user_contatos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_key text not null,        -- nome do cliente normalizado (chave única por usuário)
  client_name text not null,        -- nome original, para exibição
  phone text,
  email text,
  notes text,
  representative_id uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, contact_key)
);

alter table public.user_contatos enable row level security;

drop policy if exists "user_contatos_select_own" on public.user_contatos;
create policy "user_contatos_select_own"
  on public.user_contatos for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "user_contatos_insert_own" on public.user_contatos;
create policy "user_contatos_insert_own"
  on public.user_contatos for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "user_contatos_update_own" on public.user_contatos;
create policy "user_contatos_update_own"
  on public.user_contatos for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "user_contatos_delete_own" on public.user_contatos;
create policy "user_contatos_delete_own"
  on public.user_contatos for delete to authenticated
  using (auth.uid() = user_id);

create index if not exists idx_user_contatos_user_key
  on public.user_contatos (user_id, contact_key);
