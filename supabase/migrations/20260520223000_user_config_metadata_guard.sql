alter table public.user_configuracoes
  alter column metadata set default '{}'::jsonb;

update public.user_configuracoes
set metadata = '{}'::jsonb
where metadata is null;
