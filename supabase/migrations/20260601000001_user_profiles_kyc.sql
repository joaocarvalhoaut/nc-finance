-- Tabela de perfil KYC dos usuários (CPF, telefone, endereço)
create table if not exists public.user_profiles (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  cpf       text not null,
  phone     text not null,
  cep       text,
  address   text,
  city      text,
  state     text,
  accepted_terms_at timestamptz not null default timezone('utc', now()),
  created_at        timestamptz not null default timezone('utc', now()),
  updated_at        timestamptz not null default timezone('utc', now())
);

-- CPF único por plataforma (impede duplicatas)
create unique index if not exists user_profiles_cpf_unique
  on public.user_profiles (cpf);

-- RLS: cada usuário lê/escreve apenas seu próprio perfil
alter table public.user_profiles enable row level security;

create policy "owner select"  on public.user_profiles for select  using (auth.uid() = user_id);
create policy "owner insert"  on public.user_profiles for insert  with check (auth.uid() = user_id);
create policy "owner update"  on public.user_profiles for update  using (auth.uid() = user_id);

-- Trigger updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

create trigger user_profiles_updated_at
  before update on public.user_profiles
  for each row execute procedure public.set_updated_at();
