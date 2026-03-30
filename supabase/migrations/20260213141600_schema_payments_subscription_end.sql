-- =============================================================================
-- 16 · Add subscription_end to payments
-- Run after 15_schema_attendance.sql
--
-- Each payment row now stores the last day (inclusive) of the subscription
-- period it covers. This gives the attendance page full history to correctly
-- identify active vs. expired windows even after multiple renewals.
--
-- NULL is intentional for rows inserted before this migration; the attendance
-- page falls back to computing the end date from the player's current settings.
-- =============================================================================

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS subscription_end date;

COMMENT ON COLUMN public.payments.subscription_end IS
  'Last day (inclusive, ISO date) of the subscription period paid for. '
  'NULL for legacy rows inserted before migration 16.';
