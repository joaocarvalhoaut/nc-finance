-- Adds schedule_mode and skip_holidays to automation rules
ALTER TABLE user_automation_rules
  ADD COLUMN IF NOT EXISTS schedule_mode  TEXT    NOT NULL DEFAULT 'daily'
    CHECK (schedule_mode IN ('daily', 'weekdays')),
  ADD COLUMN IF NOT EXISTS skip_holidays  BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN user_automation_rules.schedule_mode  IS 'daily = todos os dias | weekdays = seg-sex apenas';
COMMENT ON COLUMN user_automation_rules.skip_holidays  IS 'true = pular feriados nacionais brasileiros';
