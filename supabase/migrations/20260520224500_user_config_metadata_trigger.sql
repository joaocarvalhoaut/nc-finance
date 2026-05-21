alter table public.user_configuracoes
  alter column metadata set default '{}'::jsonb;

update public.user_configuracoes
set metadata = '{}'::jsonb
where metadata is null;

create or replace function public.ensure_user_config_metadata()
returns trigger
language plpgsql
as $$
begin
  if new.metadata is null then
    new.metadata := '{}'::jsonb;
  end if;

  if new.usage_counters is null then
    new.usage_counters := '{}'::jsonb;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_user_config_metadata_guard on public.user_configuracoes;
create trigger trg_user_config_metadata_guard
before insert or update on public.user_configuracoes
for each row
execute function public.ensure_user_config_metadata();
