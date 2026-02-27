-- =============================================================================
-- 13 · Fix RLS infinite recursion — SECURITY DEFINER helpers
-- Run after 12_update_rls_new_roles.sql
--
-- ROOT CAUSE
-- ----------
-- Every policy on academy_members that contained an EXISTS subquery against
-- academy_members itself caused infinite recursion (PostgreSQL error 42P17).
-- The chain for indirect recursion was:
--
--   branches_select
--     → EXISTS (SELECT 1 FROM academy_members ...)   -- fires academy_members SELECT policy
--       → academy_members_select
--           → EXISTS (SELECT 1 FROM academy_members am_check ...)  -- fires it AGAIN
--             → ∞
--
-- RECURSIVE POLICIES (7 total, all dropped here):
--   academy_members  : academy_members_select  (migration 12)
--   academy_members  : academy_members_update  (migrations 09 + 12, same name)
--   academy_members  : academy_members_delete  (migrations 09 + 12, same name)
--   member_branch_access: mba_select, mba_insert, mba_delete (migration 11)
--   + all policies in migration 12 that indirectly triggered the above.
--
-- FIX
-- ---
-- 1. Create SECURITY DEFINER helper functions. These run as the function owner
--    (postgres) and therefore bypass RLS when querying academy_members.
--    They are scoped to auth.uid() so they cannot leak cross-user data.
--
-- 2. Rewrite ALL policies that previously used inline EXISTS/SELECT on
--    academy_members to call the helpers instead.
--
-- 3. The academy_members SELECT policy itself is rewritten to use the helpers,
--    breaking the self-referential loop entirely.
-- =============================================================================


-- ── 1. SECURITY DEFINER helper functions ─────────────────────────────────────
-- All functions: STABLE (no side effects), SECURITY DEFINER (bypass RLS),
-- search_path locked to 'public' to prevent search-path injection attacks.

-- Returns the academy_id for the currently logged-in user (from profiles).
-- Used as a cached, non-recursive way to resolve the user's academy.
CREATE OR REPLACE FUNCTION public.my_academy_id()
  RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT academy_id
  FROM   public.profiles
  WHERE  user_id = auth.uid()
  LIMIT  1;
$$;

-- True if the current user is owner OR partner in the given academy.
CREATE OR REPLACE FUNCTION public.is_owner_or_partner(p_academy_id uuid)
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   public.academy_members
    WHERE  user_id    = auth.uid()
      AND  academy_id = p_academy_id
      AND  role       IN ('owner', 'partner')
  );
$$;

-- True if the current user is a branch_manager in the given academy.
CREATE OR REPLACE FUNCTION public.is_branch_manager(p_academy_id uuid)
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   public.academy_members
    WHERE  user_id    = auth.uid()
      AND  academy_id = p_academy_id
      AND  role       = 'branch_manager'
  );
$$;

-- True if the current user is a branch_manager WITH has_finance_access = true.
CREATE OR REPLACE FUNCTION public.is_finance_manager(p_academy_id uuid)
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   public.academy_members
    WHERE  user_id           = auth.uid()
      AND  academy_id        = p_academy_id
      AND  role              = 'branch_manager'
      AND  has_finance_access = true
  );
$$;

-- True if the current user is branch_manager OR admin_staff (scoped roles).
CREATE OR REPLACE FUNCTION public.is_scoped_member(p_academy_id uuid)
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   public.academy_members
    WHERE  user_id    = auth.uid()
      AND  academy_id = p_academy_id
      AND  role       IN ('branch_manager', 'admin_staff')
  );
$$;

-- True if the current user is any kind of member in the given academy.
-- DROP required: the pre-existing function has parameter name "aid"; CREATE OR
-- REPLACE cannot rename parameters, so we must drop and recreate.
DROP FUNCTION IF EXISTS public.is_academy_member(uuid);
CREATE OR REPLACE FUNCTION public.is_academy_member(p_academy_id uuid)
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   public.academy_members
    WHERE  user_id    = auth.uid()
      AND  academy_id = p_academy_id
  );
$$;


-- ── 2. academy_members — non-recursive policies ───────────────────────────────
-- These were the PRIMARY source of recursion (policies querying their own table).

DROP POLICY IF EXISTS "academy_members_select" ON public.academy_members;
CREATE POLICY "academy_members_select" ON public.academy_members
  FOR SELECT USING (
    -- Every user always sees their own membership row
    user_id = auth.uid()
    -- Owner/partner see all rows for their academy.
    -- is_owner_or_partner() bypasses RLS → no recursion.
    OR (
      academy_id = public.my_academy_id()
      AND public.is_owner_or_partner(academy_id)
    )
  );

-- UPDATE: owner/partner can change another member's role/flags,
--         but cannot modify the owner row, and cannot modify their own row.
DROP POLICY IF EXISTS "academy_members_update" ON public.academy_members;
CREATE POLICY "academy_members_update" ON public.academy_members
  FOR UPDATE USING (
    public.is_owner_or_partner(academy_id)
    AND user_id != auth.uid()   -- cannot change your own record
    AND role    != 'owner'       -- cannot change the owner's record
  );

-- DELETE: a member can leave (except the owner);
--         owner/partner can remove any non-owner member that isn't themselves.
DROP POLICY IF EXISTS "academy_members_delete" ON public.academy_members;
CREATE POLICY "academy_members_delete" ON public.academy_members
  FOR DELETE USING (
    -- Self-removal (leaving the academy), but not the owner row
    (user_id = auth.uid() AND role != 'owner')
    -- Owner/partner removes someone else (not the owner row)
    OR (
      public.is_owner_or_partner(academy_id)
      AND user_id != auth.uid()
      AND role    != 'owner'
    )
  );


-- ── 3. member_branch_access — non-recursive policies ─────────────────────────
-- These queried academy_members, triggering the now-fixed chain.

DROP POLICY IF EXISTS "mba_select" ON public.member_branch_access;
CREATE POLICY "mba_select" ON public.member_branch_access
  FOR SELECT USING (
    user_id = auth.uid()
    OR (
      academy_id = public.my_academy_id()
      AND public.is_owner_or_partner(academy_id)
    )
  );

DROP POLICY IF EXISTS "mba_insert" ON public.member_branch_access;
CREATE POLICY "mba_insert" ON public.member_branch_access
  FOR INSERT WITH CHECK (
    academy_id = public.my_academy_id()
    AND public.is_owner_or_partner(academy_id)
  );

DROP POLICY IF EXISTS "mba_delete" ON public.member_branch_access;
CREATE POLICY "mba_delete" ON public.member_branch_access
  FOR DELETE USING (
    academy_id = public.my_academy_id()
    AND public.is_owner_or_partner(academy_id)
  );


-- ── 4. branches ───────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "branches_select" ON public.branches;
CREATE POLICY "branches_select" ON public.branches
  FOR SELECT USING (
    academy_id = public.my_academy_id()
    AND (
      public.is_owner_or_partner(academy_id)
      OR EXISTS (
        SELECT 1 FROM public.member_branch_access
        WHERE user_id   = auth.uid()
          AND academy_id = branches.academy_id
          AND branch_id  = branches.id
      )
    )
  );

DROP POLICY IF EXISTS "branches_insert" ON public.branches;
CREATE POLICY "branches_insert" ON public.branches
  FOR INSERT WITH CHECK (
    academy_id = public.my_academy_id()
    AND public.is_owner_or_partner(academy_id)
  );

DROP POLICY IF EXISTS "branches_update" ON public.branches;
CREATE POLICY "branches_update" ON public.branches
  FOR UPDATE USING (
    academy_id = public.my_academy_id()
    AND public.is_owner_or_partner(academy_id)
  );

DROP POLICY IF EXISTS "branches_delete" ON public.branches;
CREATE POLICY "branches_delete" ON public.branches
  FOR DELETE USING (
    academy_id = public.my_academy_id()
    AND public.is_owner_or_partner(academy_id)
  );


-- ── 5. players ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "players_select" ON public.players;
CREATE POLICY "players_select" ON public.players
  FOR SELECT USING (
    academy_id = public.my_academy_id()
    AND (
      public.is_owner_or_partner(academy_id)
      OR (
        players.branch_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.member_branch_access
          WHERE user_id   = auth.uid()
            AND academy_id = players.academy_id
            AND branch_id  = players.branch_id
        )
      )
    )
  );

DROP POLICY IF EXISTS "players_insert" ON public.players;
CREATE POLICY "players_insert" ON public.players
  FOR INSERT WITH CHECK (
    academy_id = public.my_academy_id()
    AND (
      public.is_owner_or_partner(academy_id)
      OR (
        players.branch_id IS NOT NULL
        AND public.is_scoped_member(academy_id)
        AND EXISTS (
          SELECT 1 FROM public.member_branch_access
          WHERE user_id   = auth.uid()
            AND academy_id = players.academy_id
            AND branch_id  = players.branch_id
        )
      )
    )
  );

DROP POLICY IF EXISTS "players_update" ON public.players;
CREATE POLICY "players_update" ON public.players
  FOR UPDATE USING (
    academy_id = public.my_academy_id()
    AND (
      public.is_owner_or_partner(academy_id)
      OR (
        players.branch_id IS NOT NULL
        AND public.is_scoped_member(academy_id)
        AND EXISTS (
          SELECT 1 FROM public.member_branch_access
          WHERE user_id   = auth.uid()
            AND academy_id = players.academy_id
            AND branch_id  = players.branch_id
        )
      )
    )
  );

DROP POLICY IF EXISTS "players_delete" ON public.players;
CREATE POLICY "players_delete" ON public.players
  FOR DELETE USING (
    academy_id = public.my_academy_id()
    AND public.is_owner_or_partner(academy_id)
  );


-- ── 6. staff ──────────────────────────────────────────────────────────────────
-- SELECT: kept open to all academy members (finance auto-sync reads salaries).
-- Writes: owner/partner full; branch_manager for their assigned branches.

DROP POLICY IF EXISTS "staff_insert" ON public.staff;
CREATE POLICY "staff_insert" ON public.staff
  FOR INSERT WITH CHECK (
    academy_id = public.my_academy_id()
    AND (
      public.is_owner_or_partner(academy_id)
      OR (
        public.is_branch_manager(academy_id)
        AND EXISTS (
          SELECT 1 FROM public.member_branch_access
          WHERE user_id   = auth.uid()
            AND academy_id = staff.academy_id
            AND branch_id  = ANY(staff.branch_ids)
        )
      )
    )
  );

DROP POLICY IF EXISTS "staff_update" ON public.staff;
CREATE POLICY "staff_update" ON public.staff
  FOR UPDATE USING (
    academy_id = public.my_academy_id()
    AND (
      public.is_owner_or_partner(academy_id)
      OR (
        public.is_branch_manager(academy_id)
        AND EXISTS (
          SELECT 1 FROM public.member_branch_access
          WHERE user_id   = auth.uid()
            AND academy_id = staff.academy_id
            AND branch_id  = ANY(staff.branch_ids)
        )
      )
    )
  );

DROP POLICY IF EXISTS "staff_delete" ON public.staff;
CREATE POLICY "staff_delete" ON public.staff
  FOR DELETE USING (
    academy_id = public.my_academy_id()
    AND public.is_owner_or_partner(academy_id)
  );


-- ── 7. payments ───────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "payments_select" ON public.payments;
CREATE POLICY "payments_select" ON public.payments
  FOR SELECT USING (
    academy_id = public.my_academy_id()
    AND (
      public.is_owner_or_partner(academy_id)
      OR (
        payments.branch_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.member_branch_access
          WHERE user_id   = auth.uid()
            AND academy_id = payments.academy_id
            AND branch_id  = payments.branch_id
        )
      )
    )
  );

DROP POLICY IF EXISTS "payments_insert" ON public.payments;
CREATE POLICY "payments_insert" ON public.payments
  FOR INSERT WITH CHECK (
    academy_id = public.my_academy_id()
    AND (
      public.is_owner_or_partner(academy_id)
      OR (
        payments.branch_id IS NOT NULL
        AND public.is_scoped_member(academy_id)
        AND EXISTS (
          SELECT 1 FROM public.member_branch_access
          WHERE user_id   = auth.uid()
            AND academy_id = payments.academy_id
            AND branch_id  = payments.branch_id
        )
      )
    )
  );

DROP POLICY IF EXISTS "payments_delete" ON public.payments;
CREATE POLICY "payments_delete" ON public.payments
  FOR DELETE USING (
    academy_id = public.my_academy_id()
    AND public.is_owner_or_partner(academy_id)
  );


-- ── 8. finance_tx ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "finance_tx_select" ON public.finance_tx;
CREATE POLICY "finance_tx_select" ON public.finance_tx
  FOR SELECT USING (
    academy_id = public.my_academy_id()
    AND (
      public.is_owner_or_partner(academy_id)
      OR (
        public.is_finance_manager(academy_id)
        AND finance_tx.branch_id != 'all'
        AND EXISTS (
          SELECT 1 FROM public.member_branch_access
          WHERE user_id           = auth.uid()
            AND academy_id        = finance_tx.academy_id
            AND branch_id::text   = finance_tx.branch_id
        )
      )
    )
  );

DROP POLICY IF EXISTS "finance_tx_insert" ON public.finance_tx;
CREATE POLICY "finance_tx_insert" ON public.finance_tx
  FOR INSERT WITH CHECK (
    academy_id = public.my_academy_id()
    AND public.is_owner_or_partner(academy_id)
  );

DROP POLICY IF EXISTS "finance_tx_update" ON public.finance_tx;
CREATE POLICY "finance_tx_update" ON public.finance_tx
  FOR UPDATE USING (
    academy_id = public.my_academy_id()
    AND public.is_owner_or_partner(academy_id)
  );

DROP POLICY IF EXISTS "finance_tx_delete" ON public.finance_tx;
CREATE POLICY "finance_tx_delete" ON public.finance_tx
  FOR DELETE USING (
    academy_id = public.my_academy_id()
    AND public.is_owner_or_partner(academy_id)
  );


-- ── 9. invitations ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "invitations_select" ON public.invitations;
CREATE POLICY "invitations_select" ON public.invitations
  FOR SELECT USING (
    (
      academy_id = public.my_academy_id()
      AND public.is_owner_or_partner(academy_id)
    )
    OR email = (auth.jwt()->>'email')
  );

DROP POLICY IF EXISTS "invitations_insert" ON public.invitations;
CREATE POLICY "invitations_insert" ON public.invitations
  FOR INSERT WITH CHECK (
    invited_by = auth.uid()
    AND academy_id = public.my_academy_id()
    AND public.is_owner_or_partner(academy_id)
  );

DROP POLICY IF EXISTS "invitations_delete" ON public.invitations;
CREATE POLICY "invitations_delete" ON public.invitations
  FOR DELETE USING (
    academy_id = public.my_academy_id()
    AND public.is_owner_or_partner(academy_id)
  );
