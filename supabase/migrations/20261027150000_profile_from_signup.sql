-- ─────────────────────────────────────────────────────────────────────────────
-- Perfil (CPF, telefone, endereço) criado pelo banco no momento do cadastro
--
-- BUG: o front gravava user_profiles logo após o signUp. Com confirmação de
-- e-mail ligada, nesse momento ainda não há sessão: o insert rodava como anon,
-- a RLS ("owner insert", auth.uid() = user_id) recusava e o erro só ia para o
-- console. Toda conta criada assim ficou sem CPF, telefone e endereço.
--
-- Agora o signUp manda os dados em user_metadata e este gatilho cria o perfil
-- dentro da mesma transação que cria o usuário — sem depender de sessão. Logo
-- em seguida tira os dados pessoais dos metadados, que viajam no token de login.
--
-- CPF repetido viola user_profiles_cpf_unique e desfaz o cadastro inteiro: não
-- nasce conta sem perfil. O front mostra "CPF já cadastrado".
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.create_profile_from_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  -- Contas sem os dados no cadastro (convites, contas antigas): o app pede
  -- para completar no primeiro acesso.
  if coalesce(m->>'cpf', '') = '' then
    return new;
  end if;

  insert into public.user_profiles (user_id, full_name, cpf, phone, cep, address, city, state, accepted_terms_at)
  values (
    new.id,
    coalesce(nullif(trim(m->>'full_name'), ''), new.email),
    regexp_replace(m->>'cpf', '\D', '', 'g'),
    regexp_replace(coalesce(m->>'phone', ''), '\D', '', 'g'),
    nullif(regexp_replace(coalesce(m->>'cep', ''), '\D', '', 'g'), ''),
    nullif(trim(m->>'address'), ''),
    nullif(trim(m->>'city'), ''),
    nullif(trim(m->>'state'), ''),
    timezone('utc', now())
  );

  update auth.users
     set raw_user_meta_data = m - 'cpf' - 'phone' - 'cep' - 'address' - 'city' - 'state'
   where id = new.id;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.create_profile_from_signup();
