-- SOMENTE LEITURA: revisão dos horários antes do deploy UTC-3.
-- Sem nomes de clientes, telefones, mensagens ou credenciais.
begin read only;
select id as rule_id, enabled, send_window_start, send_window_end,
       case
         when send_window_start is null and send_window_end is null then 'sem janela'
         when send_window_start is null or send_window_end is null then 'janela incompleta'
         when send_window_start >= send_window_end then 'janela invertida ou igual'
         else 'revisar intencao do operador: interpretacao muda de UTC para UTC-3'
       end as review_required
from public.user_automation_rules
order by enabled desc, id;
select status, count(*) as jobs, min(scheduled_for) as earliest, max(scheduled_for) as latest
from public.user_dispatch_jobs
where status in ('queued','retrying','processing')
group by status;
rollback;
