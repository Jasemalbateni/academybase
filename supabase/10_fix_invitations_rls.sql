-- =============================================================================
-- 10 · Fix invitations RLS policies
-- Run after 09_update_rls_roles.sql
--
-- Bug: invitations_select and invitations_update policies referenced
-- auth.users directly:
--
--   SELECT email FROM auth.users WHERE id = auth.uid()
--
-- The `authenticated` role lacks SELECT privilege on auth.users in Supabase.
-- PostgreSQL raises permission denied when evaluating the policy, which
-- PostgREST returns as HTTP 403 — not an empty result but a hard rejection.
--
-- Fix: Replace with (auth.jwt()->>'email'), which reads the email directly
-- from the already-verified JWT token. No table access required; works for
-- all authenticated users and for service_role operations.
--
-- Also adds an explicit GRANT as a belt-and-suspenders measure — safe to
-- re-run if Supabase has already applied default grants.
-- =============================================================================

-- Ensure the authenticated role has the required privileges on this table.
-- Supabase normally applies these via ALTER DEFAULT PRIVILEGES, but making
-- it explicit prevents 403s in projects where that was not configured.
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.invitations
  TO authenticated, service_role;

-- ── Fix SELECT policy ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "invitations_select" ON public.invitations;
CREATE POLICY "invitations_select" ON public.invitations
  FOR SELECT USING (
    -- Owner can see all pending invitations for their academy
    (
      academy_id = (
        SELECT academy_id FROM public.profiles
        WHERE user_id = auth.uid()
        LIMIT 1
      )
      AND EXISTS (
        SELECT 1 FROM public.academy_members
        WHERE user_id   = auth.uid()
          AND academy_id = invitations.academy_id
          AND role       = 'owner'
      )
    )
    -- Invitee can read their own invitation (required for acceptance flow)
    OR email = (auth.jwt()->>'email')
  );

-- ── Fix UPDATE policy ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "invitations_update" ON public.invitations;
CREATE POLICY "invitations_update" ON public.invitations
  FOR UPDATE USING (
    email        = (auth.jwt()->>'email')
    AND accepted_at IS NULL
    AND expires_at  > now()
  );
