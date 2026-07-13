-- ============================================================
-- Migration: 20260701000000_automation_run_sent_counter
--
-- Propósito:
--   A coluna "Enviados" do histórico de automações mostrava sempre 0 porque o
--   envio é assíncrono (worker process-dispatch-jobs) e não atualizava a run.
--   Aqui ligamos cada job à sua run e criamos um incremento atômico para o
--   worker contabilizar enviados/falhas na run correspondente.
-- ============================================================

-- 1. Liga o job de dispatch à execução (run) que o criou
alter table public.user_dispatch_jobs
  add column if not exists automation_run_id uuid
  references public.user_automation_runs(id) on delete set null;

create index if not exists idx_udj_automation_run
  on public.user_dispatch_jobs (automation_run_id);

-- 2. Incremento atômico de sent/failed em user_automation_runs.
--    UPDATE ... col = col + delta é atômico (sem race read-then-write).
create or replace function public.increment_automation_run_counter(
  p_run_id uuid,
  p_sent   int default 0,
  p_failed int default 0
) returns void
language sql
security definer
set search_path = public
as $$
  update public.user_automation_runs
  set sent   = coalesce(sent, 0)   + p_sent,
      failed = coalesce(failed, 0) + p_failed
  where id = p_run_id;
$$;

grant execute on function public.increment_automation_run_counter(uuid, int, int)
  to service_role;
