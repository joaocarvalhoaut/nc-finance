-- ============================================================
-- Migration: 20260521060000_pilot_atomic_increment
--
-- Purpose:
--   Replace the read-then-write pattern in incrementPilotDailyCount
--   with a single atomic SQL RPC to eliminate race conditions when
--   multiple concurrent sends hit the same user + same day.
--
-- Functions created:
--   1. increment_pilot_daily_count(p_user_id, p_delta)
--      → pure increment, always succeeds (fire-and-forget after send)
--
--   2. check_and_increment_pilot_count(p_user_id, p_daily_limit, p_delta)
--      → atomic check + increment in one statement
--      → returns (allowed bool, today_count int, remaining int)
--      → used instead of separate checkPilotGuard + incrementPilotDailyCount
--        when callers want a single round-trip
-- ============================================================

-- ── 1. Simple atomic increment ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.increment_pilot_daily_count(
  p_user_id  UUID,
  p_delta    INT DEFAULT 1
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO pilot_daily_sends (user_id, send_date, sent_count, updated_at)
  VALUES (p_user_id, CURRENT_DATE, p_delta, NOW())
  ON CONFLICT (user_id, send_date)
  DO UPDATE SET
    sent_count = pilot_daily_sends.sent_count + EXCLUDED.sent_count,
    updated_at = NOW();
$$;

-- Grant to service_role (Edge Functions run as service_role)
GRANT EXECUTE ON FUNCTION public.increment_pilot_daily_count(UUID, INT)
  TO service_role;

-- ── 2. Atomic check-and-increment ─────────────────────────────────────────────
--
-- Returns a single row:
--   allowed      BOOLEAN  — true if sending is permitted (count < limit)
--   today_count  INT      — count BEFORE this increment (0 if first send today)
--   remaining    INT      — slots left AFTER this increment (0 if blocked)
--
-- If allowed=false the row is NOT updated; count stays the same.

CREATE OR REPLACE FUNCTION public.check_and_increment_pilot_count(
  p_user_id     UUID,
  p_daily_limit INT,
  p_delta       INT DEFAULT 1
)
RETURNS TABLE(allowed BOOLEAN, today_count INT, remaining INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current INT;
BEGIN
  -- Ensure a row exists for today (insert 0 if missing), then lock it
  INSERT INTO pilot_daily_sends (user_id, send_date, sent_count, updated_at)
  VALUES (p_user_id, CURRENT_DATE, 0, NOW())
  ON CONFLICT (user_id, send_date) DO NOTHING;

  -- Lock the row for this transaction
  SELECT sent_count
    INTO v_current
    FROM pilot_daily_sends
   WHERE user_id   = p_user_id
     AND send_date = CURRENT_DATE
  FOR UPDATE;

  IF v_current + p_delta > p_daily_limit THEN
    -- Over limit — do not increment
    RETURN QUERY SELECT
      FALSE::BOOLEAN                   AS allowed,
      v_current                        AS today_count,
      0                                AS remaining;
    RETURN;
  END IF;

  -- Within limit — increment atomically
  UPDATE pilot_daily_sends
     SET sent_count = v_current + p_delta,
         updated_at = NOW()
   WHERE user_id   = p_user_id
     AND send_date = CURRENT_DATE;

  RETURN QUERY SELECT
    TRUE::BOOLEAN                              AS allowed,
    v_current                                  AS today_count,
    (p_daily_limit - v_current - p_delta)      AS remaining;
END;
$$;

-- Grant to service_role
GRANT EXECUTE ON FUNCTION public.check_and_increment_pilot_count(UUID, INT, INT)
  TO service_role;

-- ── 3. Ensure unique constraint exists on (user_id, send_date) ────────────────
--   Required for the ON CONFLICT clause above.
--   The original pilot_mode migration should already have this, but we add it
--   idempotently just in case.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname   = 'pilot_daily_sends_user_id_send_date_key'
       AND conrelid  = 'pilot_daily_sends'::regclass
  ) THEN
    ALTER TABLE pilot_daily_sends
      ADD CONSTRAINT pilot_daily_sends_user_id_send_date_key
      UNIQUE (user_id, send_date);
  END IF;
END;
$$;
