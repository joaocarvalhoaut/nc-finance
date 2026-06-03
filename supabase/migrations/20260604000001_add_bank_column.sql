-- Adiciona coluna `bank` para armazenar o banco/produto de cartão extraído do documento
ALTER TABLE user_registros_financeiros
  ADD COLUMN IF NOT EXISTS bank text;
