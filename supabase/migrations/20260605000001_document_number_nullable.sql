-- Allow document_number to be NULL so records without a document can be saved
ALTER TABLE user_registros_financeiros
  ALTER COLUMN document_number DROP NOT NULL;
