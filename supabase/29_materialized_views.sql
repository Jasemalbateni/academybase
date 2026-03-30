-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 29: Materialized views for dashboard / statistics performance
--
-- Views are CONCURRENTLY refreshable (require at least one row to exist).
-- Refresh strategy: call REFRESH MATERIALIZED VIEW CONCURRENTLY from a
-- Supabase Edge Function or pg_cron job after data-changing operations.
-- Or call manually: SELECT refresh_academy_views();
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. mv_monthly_revenue ─────────────────────────────────────────────────────
-- Revenue and expense totals per academy per month.

CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_monthly_revenue AS
SELECT
  academy_id,
  month,
  SUM(CASE WHEN type = 'إيراد' AND source != 'suppressed' THEN amount ELSE 0 END) AS revenue,
  SUM(CASE WHEN type = 'مصروف' AND source != 'suppressed' THEN amount ELSE 0 END) AS expenses,
  SUM(CASE
        WHEN source != 'suppressed' AND type = 'إيراد' THEN  amount
        WHEN source != 'suppressed' AND type = 'مصروف' THEN -amount
        ELSE 0
      END) AS profit
FROM public.finance_tx
GROUP BY academy_id, month;

-- Unique index required for CONCURRENTLY refresh
CREATE UNIQUE INDEX IF NOT EXISTS mv_monthly_revenue_pk
  ON public.mv_monthly_revenue (academy_id, month);


-- ── 2. mv_attendance_rate ─────────────────────────────────────────────────────
-- Attendance rate (%) per academy per branch per month (YYYY-MM).

CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_attendance_rate AS
SELECT
  a.academy_id,
  a.branch_id,
  LEFT(a.date, 7)                                   AS month,
  COUNT(*)                                           AS total_records,
  SUM(CASE WHEN a.present THEN 1 ELSE 0 END)        AS present_count,
  ROUND(
    100.0 * SUM(CASE WHEN a.present THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0),
    1
  )                                                  AS attendance_pct
FROM public.attendance a
GROUP BY a.academy_id, a.branch_id, LEFT(a.date, 7);

CREATE UNIQUE INDEX IF NOT EXISTS mv_attendance_rate_pk
  ON public.mv_attendance_rate (academy_id, branch_id, month);


-- ── 3. mv_renewal_rate ────────────────────────────────────────────────────────
-- Monthly new vs. renewal player counts per academy.
-- new_players  = players whose FIRST-EVER payment falls in this month
-- renew_players = players with payment history before this month

CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_renewal_rate AS
WITH first_payment AS (
  SELECT player_id, MIN(date) AS first_date
  FROM   public.payments
  WHERE  kind != 'legacy'
  GROUP  BY player_id
),
monthly_payers AS (
  SELECT DISTINCT
    p.academy_id,
    LEFT(p.date, 7)  AS month,
    p.player_id,
    fp.first_date
  FROM  public.payments p
  JOIN  first_payment fp USING (player_id)
  WHERE p.kind != 'legacy'
)
SELECT
  academy_id,
  month,
  COUNT(*)                                                   AS total_players,
  SUM(CASE WHEN LEFT(first_date, 7) = month THEN 1 ELSE 0 END) AS new_players,
  SUM(CASE WHEN LEFT(first_date, 7) < month  THEN 1 ELSE 0 END) AS renew_players,
  ROUND(
    100.0 * SUM(CASE WHEN LEFT(first_date, 7) < month THEN 1 ELSE 0 END)
            / NULLIF(COUNT(*), 0),
    1
  )                                                           AS renewal_rate_pct
FROM monthly_payers
GROUP BY academy_id, month;

CREATE UNIQUE INDEX IF NOT EXISTS mv_renewal_rate_pk
  ON public.mv_renewal_rate (academy_id, month);


-- ── 4. Helper function: refresh all views ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.refresh_academy_views()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_monthly_revenue;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_attendance_rate;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_renewal_rate;
END;
$$;

-- Grant execute to authenticated role so Edge Functions can call it
GRANT EXECUTE ON FUNCTION public.refresh_academy_views() TO authenticated;


-- ── 5. RLS: views inherit underlying table RLS, but add explicit policies ─────
-- Materialized views do NOT inherit RLS automatically — use a security definer
-- function to access them, or grant SELECT and enforce academy_id filtering
-- in application queries.

GRANT SELECT ON public.mv_monthly_revenue TO authenticated;
GRANT SELECT ON public.mv_attendance_rate  TO authenticated;
GRANT SELECT ON public.mv_renewal_rate     TO authenticated;

-- NOTE: Applications MUST filter by academy_id when querying these views.
-- Example: SELECT * FROM mv_monthly_revenue WHERE academy_id = $1 AND month = $2
