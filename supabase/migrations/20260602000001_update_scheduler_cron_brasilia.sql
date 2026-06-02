-- Atualiza o horário do scheduler para 08:00 horário de Brasília (UTC-3 = 11:00 UTC)
-- De: 0 5 * * * (05:00 UTC = 02:00 Brasília)
-- Para: 0 11 * * * (11:00 UTC = 08:00 Brasília)

SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'nc-finance-scheduler' LIMIT 1),
  schedule := '0 11 * * *'
);
