-- ─────────────────────────────────────────────────────────────────────────────
-- pg_cron setup for materialized view refresh
--
-- PREREQUISITES (do once in Supabase Dashboard):
--   1. Go to Database → Extensions → search "pg_cron" → Enable
--   2. Run this file in the SQL Editor
--
-- This schedules refresh_academy_views() every 5 minutes.
-- The function handles empty views gracefully (migration 30 must be applied).
--
-- To verify the job was created:
--   SELECT * FROM cron.job;
--
-- To remove the job if needed:
--   SELECT cron.unschedule('refresh-academy-views');
-- ─────────────────────────────────────────────────────────────────────────────

-- Remove existing schedule if present (idempotent)
SELECT cron.unschedule('refresh-academy-views')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'refresh-academy-views'
);

-- Schedule: every 5 minutes
SELECT cron.schedule(
  'refresh-academy-views',
  '*/5 * * * *',
  'SELECT public.refresh_academy_views()'
);
