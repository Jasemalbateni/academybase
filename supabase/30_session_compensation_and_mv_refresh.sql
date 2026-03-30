-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 30: Session compensation tracking + materialized view refresh fix
--
-- Part A: Add compensated_player_ids to calendar_events
--   Stores the exact player IDs that were compensated when a session was
--   cancelled. Used by the restore flow to reverse exactly those players
--   without re-deriving eligibility from current (potentially changed) state.
--
-- Part B: Fix refresh_academy_views() to handle empty materialized views
--   REFRESH MATERIALIZED VIEW CONCURRENTLY fails if the view is empty.
--   This version falls back to a non-concurrent refresh for empty views.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Part A ───────────────────────────────────────────────────────────────────

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS compensated_player_ids text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.calendar_events.compensated_player_ids IS
  'IDs of players whose subscriptions were extended when this cancelled training '
  'session was created. Used by the restore flow to reverse the exact compensation '
  'without re-evaluating eligibility against current (potentially changed) state.';

-- ── Part B ───────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.refresh_academy_views()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count bigint;
BEGIN
  -- mv_monthly_revenue
  SELECT COUNT(*) INTO v_count FROM public.mv_monthly_revenue;
  IF v_count > 0 THEN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_monthly_revenue;
  ELSE
    REFRESH MATERIALIZED VIEW public.mv_monthly_revenue;
  END IF;

  -- mv_attendance_rate
  SELECT COUNT(*) INTO v_count FROM public.mv_attendance_rate;
  IF v_count > 0 THEN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_attendance_rate;
  ELSE
    REFRESH MATERIALIZED VIEW public.mv_attendance_rate;
  END IF;

  -- mv_renewal_rate
  SELECT COUNT(*) INTO v_count FROM public.mv_renewal_rate;
  IF v_count > 0 THEN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_renewal_rate;
  ELSE
    REFRESH MATERIALIZED VIEW public.mv_renewal_rate;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_academy_views() TO authenticated;
