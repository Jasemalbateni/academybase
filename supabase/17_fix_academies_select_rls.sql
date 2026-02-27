-- =============================================================================
-- 17 · Fix academies SELECT policy — allow all academy members to read name
-- Run after 16_schema_payments_subscription_end.sql
--
-- ROOT CAUSE
-- ----------
-- Migration 02 created "academies_select_own" which restricts SELECT to
-- owner_id = auth.uid() only. Non-owner members (partner, branch_manager,
-- admin_staff) receive NULL for the academy name in Dashboard and Sidebar,
-- causing the UI to show "AcademyBase" or "أكاديمية" instead of the real name.
--
-- FIX
-- ---
-- Replace the owner-only policy with one that also allows any authenticated
-- member of the academy to read the academy's name.
-- Uses my_academy_id() SECURITY DEFINER helper from migration 14 — no recursion.
-- =============================================================================

DROP POLICY IF EXISTS "academies_select_own" ON public.academies;
DROP POLICY IF EXISTS "academies_select"     ON public.academies;

CREATE POLICY "academies_select" ON public.academies
  FOR SELECT USING (
    owner_id = auth.uid()          -- owner always has full access
    OR id = public.my_academy_id() -- all academy members can read their academy's name
  );

COMMENT ON POLICY "academies_select" ON public.academies IS
  'Owner can always read their academy. '
  'All members resolved via profiles.academy_id (SECURITY DEFINER, no recursion) '
  'can read the academy name for display in Sidebar and Dashboard.';
