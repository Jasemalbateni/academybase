-- =============================================================================
-- 14 · Complete non-recursive RLS fix (idempotent)
-- Run after 13_fix_rls_recursion.sql (or instead of it if 13 was never applied)
--
-- ROOT CAUSE
-- ----------
-- Migration 12 introduced "academy_members_select" with an inline EXISTS subquery
-- against academy_members itself → PostgreSQL error 42P17 (infinite recursion).
-- Every RLS policy on branches/players/payments/etc. that checked roles via
-- EXISTS (...FROM academy_members...) also triggered this loop.
--
-- Symptoms produced by the recursion:
--   • Console shows {} for load errors (PostgrestError not serialising)
--   • All data pages (dashboard, branches, players) fail to load
--   • getMembership() falls back to admin_staff → owner appears as "اداري"
--   • New signups also appear as "اداري" for the same reason
--
-- FIX
-- ---
-- 1. SECURITY DEFINER helper functions query academy_members as the function
--    owner (postgres / BYPASSRLS). No RLS policies are evaluated inside them.
-- 2. All policies that previously used inline EXISTS on academy_members now
--    call these helpers instead.
-- 3. academy_members' own SELECT policy is rewritten to use the helpers,
--    breaking the self-referential loop.
--
-- ADDITIONS vs 13_fix_rls_recursion.sql
-- ---------------------------------------
-- • academy_members INSERT policy: prevents inserting role='owner' for an
--   academy that the caller does not own (security hardening).
-- • academy_members UPDATE policy: adds WITH CHECK (role != 'owner') to
--   prevent promoting any member to owner via UPDATE.
-- • staff_select policy: explicitly created using SECURITY DEFINER helpers
--   so it cannot recurse regardless of what migration 06 left behind.
-- =============================================================================


-- ── 1. SECURITY DEFINER helper functions ─────────────────────────────────────
-- STABLE + SECURITY DEFINER + locked search_path prevents injection attacks.
-- All run as the function owner (postgres) which has BYPASSRLS, breaking
-- the recursive chain completely.

-- Returns current user's academy_id from profiles (non-recursive, uses direct
-- user_id = auth.uid() policy on profiles).
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

-- True if current user is owner OR partner in the given academy.
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

-- True if current user is branch_manager in the given academy.
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

-- True if current user is branch_manager WITH has_finance_access = true.
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

-- True if current user is branch_manager OR admin_staff (scoped roles).
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

-- True if current user is any member of the given academy.
-- DROP required: can't rename parameters with CREATE OR REPLACE.
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
-- These WERE the primary source of recursion: each policy queried its own table.

-- SELECT: own row always visible; owner/partner see all rows in their academy.
DROP POLICY IF EXISTS "academy_members_select_own" ON public.academy_members;
DROP POLICY IF EXISTS "academy_members_select"     ON public.academy_members;
CREATE POLICY "academy_members_select" ON public.academy_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR (
      academy_id = public.my_academy_id()
      AND public.is_owner_or_partner(academy_id)
    )
  );

-- INSERT: user inserts their own row only.
-- Additional guard: role='owner' is only allowed if the caller actually owns
-- the academy (i.e., they appear in academies.owner_id). This prevents a
-- malicious user from claiming owner status on someone else's academy.
DROP POLICY IF EXISTS "academy_members_insert_own" ON public.academy_members;
DROP POLICY IF EXISTS "academy_members_insert"     ON public.academy_members;
CREATE POLICY "academy_members_insert_own" ON public.academy_members
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND (
      -- Claiming owner role: only if they really own this academy
      (
        role = 'owner'
        AND EXISTS (
          SELECT 1 FROM public.academies
          WHERE id = academy_id AND owner_id = auth.uid()
        )
      )
      -- Any non-owner role (invitation acceptance flow)
      OR role != 'owner'
    )
  );

-- UPDATE: owner/partner can change another member's role/flags,
-- but cannot change their own row, cannot change the owner's row,
-- and cannot promote anyone to owner (WITH CHECK).
DROP POLICY IF EXISTS "academy_members_update" ON public.academy_members;
CREATE POLICY "academy_members_update" ON public.academy_members
  FOR UPDATE
  USING (
    public.is_owner_or_partner(academy_id)
    AND user_id  != auth.uid()  -- cannot edit your own row
    AND role     != 'owner'     -- cannot edit the owner's row
  )
  WITH CHECK (
    role != 'owner'             -- cannot promote any row to owner via update
  );

-- DELETE: a member can leave (except the owner row);
-- owner/partner can remove any non-owner member that isn't themselves.
DROP POLICY IF EXISTS "academy_members_delete" ON public.academy_members;
CREATE POLICY "academy_members_delete" ON public.academy_members
  FOR DELETE USING (
    -- Self-removal (leave), but the owner row is permanent
    (user_id = auth.uid() AND role != 'owner')
    -- Owner/partner removes someone else (not the owner row)
    OR (
      public.is_owner_or_partner(academy_id)
      AND user_id != auth.uid()
      AND role    != 'owner'
    )
  );


-- ── 3. member_branch_access — non-recursive policies ─────────────────────────

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
-- SELECT: all academy members can read staff (needed for finance auto-sync).
-- Writes: owner/partner full; branch_manager for their assigned branches.

DROP POLICY IF EXISTS "staff_select" ON public.staff;
CREATE POLICY "staff_select" ON public.staff
  FOR SELECT USING (
    academy_id = public.my_academy_id()
    AND public.is_academy_member(academy_id)
  );

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
    OR email = (auth.jwt() ->> 'email')
  );

DROP POLICY IF EXISTS "invitations_insert" ON public.invitations;
CREATE POLICY "invitations_insert" ON public.invitations
  FOR INSERT WITH CHECK (
    invited_by = auth.uid()
    AND academy_id = public.my_academy_id()
    AND public.is_owner_or_partner(academy_id)
  );

DROP POLICY IF EXISTS "invitations_update" ON public.invitations;
CREATE POLICY "invitations_update" ON public.invitations
  FOR UPDATE USING (
    -- Invitee marks their own invitation as accepted
    email = (auth.jwt() ->> 'email')
    AND accepted_at IS NULL
  );

DROP POLICY IF EXISTS "invitations_delete" ON public.invitations;
CREATE POLICY "invitations_delete" ON public.invitations
  FOR DELETE USING (
    academy_id = public.my_academy_id()
    AND public.is_owner_or_partner(academy_id)
  );
