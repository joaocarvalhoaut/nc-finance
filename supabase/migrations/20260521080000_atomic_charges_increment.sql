-- ============================================================
-- Migration: 20260521080000_atomic_charges_increment
--
-- Purpose:
--   Replace the read-then-write race condition in charges_sent
--   with an atomic SQL RPC — mirrors the pattern already used
--   for pilot_daily_sends (20260521060000).
--
-- Functions created:
--   1. increment_charges_sent(p_user_id, p_period, p_delta)
--      → pure atomic increment via INSERT … ON CONFLICT DO UPDATE
--      → safe to call from concurrent Edge Function invocations
-- ============================================================

CREATE OR REPLACE FUNCTION public.increment_charges_sent(
  p_user_id  UUID,
  p_period   TEXT,
  p_delta    INT DEFAULT 1
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO user_usage_counters (user_id, period, charges_sent, sheets_imports, drive_lookups, updated_at)
  VALUES (p_user_id, p_period, p_delta, 0, 0, NOW())
  ON CONFLICT (user_id, period)
  DO UPDATE SET
    charges_sent = user_usage_counters.charges_sent + EXCLUDED.charges_sent,
    updated_at   = NOW();
$$;

-- Grant execution to service_role only (Edge Functions run as service_role)
GRANT EXECUTE ON FUNCTION public.increment_charges_sent(UUID, TEXT, INT)
  TO service_role;

COMMENT ON FUNCTION public.increment_charges_sent IS
  'Atomic increment of charges_sent in user_usage_counters. Race-condition-safe. Call after each confirmed successful send.';
