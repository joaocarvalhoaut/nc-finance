-- Atualiza o horário do scheduler para 08:00 horário de Brasília (UTC-3 = 11:00 UTC)
-- De: 0 5 * * * (05:00 UTC = 02:00 Brasília)
-- Para: 0 11 * * * (11:00 UTC = 08:00 Brasília)
--
-- DEFENSIVO: o job de cron e a extensão pg_cron são configurados manualmente no
-- dashboard (fora das migrations). Em um banco novo (staging/local) eles não
-- existem, então esta migration precisa ser um no-op nesse caso — senão o
-- `db push` quebra e nenhum ambiente novo consegue reproduzir a produção.
-- Só altera o schedule quando pg_cron existe E o job já foi criado.

-- IFs ANINHADOS (não "A AND B"): a referência a cron.job só é planejada dentro
-- do ramo onde pg_cron já existe. Se o schema cron não existe, o statement
-- interno nunca é alcançado nem planejado — evitando o erro 42P01.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'nc-finance-scheduler') THEN
      PERFORM cron.alter_job(
        job_id   := (SELECT jobid FROM cron.job WHERE jobname = 'nc-finance-scheduler' LIMIT 1),
        schedule := '0 11 * * *'
      );
    ELSE
      RAISE NOTICE 'Job nc-finance-scheduler ausente — pulando (esperado em banco novo).';
    END IF;
  ELSE
    RAISE NOTICE 'Extensão pg_cron ausente — pulando alteração de schedule (esperado em banco novo).';
  END IF;
END $$;
