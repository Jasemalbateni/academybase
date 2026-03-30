-- =============================================================================
-- 11 · New role system + invitation signup fix
-- Run after 10_fix_invitations_rls.sql
--
-- PART 1 — Fix invitation signup failure:
--   profiles.academy_id was NOT NULL in 01_create_schema.sql.
--   setupInvitedUserAction() inserts a profile without academy_id (it's set
--   later by acceptInvitationAction). Dropping NOT NULL fixes the constraint
--   violation without weakening any security — RLS still requires user_id match.
--
-- PART 2 — New role architecture:
--   Old roles:  owner | admin | staff
--   New roles:  owner | partner | branch_manager | admin_staff
--
--   Migration:  admin  → partner      (same full access, now called "شريك")
--               staff  → admin_staff  (same limited access, now called "اداري")
--
--   New: has_finance_access flag on academy_members
--   New: member_branch_access table for branch-scoped roles
-- =============================================================================

-- ── PART 1: Fix profiles.academy_id NOT NULL ─────────────────────────────────
-- The invite flow creates a profile without academy_id, then sets it on
-- invitation acceptance. The column must be nullable to support this.
ALTER TABLE public.profiles ALTER COLUMN academy_id DROP NOT NULL;

-- ── PART 2a: academy_members — new columns + role migration ─────────────────

-- Add finance access flag (safe: DEFAULT false, NOT NULL)
ALTER TABLE public.academy_members
  ADD COLUMN IF NOT EXISTS has_finance_access boolean NOT NULL DEFAULT false;

-- Give existing owners permanent finance access
UPDATE public.academy_members
  SET has_finance_access = true
  WHERE role = 'owner';

-- Drop the old role CHECK so we can migrate data before re-adding it
ALTER TABLE public.academy_members
  DROP CONSTRAINT IF EXISTS academy_members_role_check;

-- Migrate old roles to new names
UPDATE public.academy_members
  SET role = 'partner', has_finance_access = true
  WHERE role = 'admin';

UPDATE public.academy_members
  SET role = 'admin_staff'
  WHERE role = 'staff';

-- Enforce new role values
ALTER TABLE public.academy_members
  ADD CONSTRAINT academy_members_role_check
  CHECK (role IN ('owner', 'partner', 'branch_manager', 'admin_staff'));

-- ── PART 2b: invitations — update role CHECK + new columns ───────────────────

ALTER TABLE public.invitations
  DROP CONSTRAINT IF EXISTS invitations_role_check;

-- Migrate existing invitations to new role names
UPDATE public.invitations SET role = 'partner'    WHERE role = 'admin';
UPDATE public.invitations SET role = 'admin_staff' WHERE role = 'staff';

-- New CHECK: owner is never invitable (they register directly)
ALTER TABLE public.invitations
  ADD CONSTRAINT invitations_role_check
  CHECK (role IN ('partner', 'branch_manager', 'admin_staff'));

-- Branch list and finance flag for branch-scoped invitations
ALTER TABLE public.invitations
  ADD COLUMN IF NOT EXISTS branch_ids        uuid[]  NOT NULL DEFAULT '{}';
ALTER TABLE public.invitations
  ADD COLUMN IF NOT EXISTS has_finance_access boolean NOT NULL DEFAULT false;

-- ── PART 2c: member_branch_access table ─────────────────────────────────────
-- Stores which branches each branch_manager / admin_staff can access.
-- owner and partner always have full academy access — no rows needed for them.
-- Deleting a branch (ON DELETE CASCADE) automatically removes access entries.

CREATE TABLE IF NOT EXISTS public.member_branch_access (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  academy_id  uuid        NOT NULL REFERENCES public.academies(id)  ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id)         ON DELETE CASCADE,
  branch_id   uuid        NOT NULL REFERENCES public.branches(id)    ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (academy_id, user_id, branch_id)
);

ALTER TABLE public.member_branch_access ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.member_branch_access
  TO authenticated, service_role;

-- Indexes for fast lookups (used in every branch-scoped RLS policy)
CREATE INDEX IF NOT EXISTS mba_user_id_idx      ON public.member_branch_access (user_id);
CREATE INDEX IF NOT EXISTS mba_academy_id_idx   ON public.member_branch_access (academy_id);
CREATE INDEX IF NOT EXISTS mba_branch_id_idx    ON public.member_branch_access (branch_id);
CREATE INDEX IF NOT EXISTS mba_user_academy_idx ON public.member_branch_access (user_id, academy_id);

-- ── RLS for member_branch_access ─────────────────────────────────────────────

-- SELECT: own rows always visible; owner/partner see all for their academy
DROP POLICY IF EXISTS "mba_select" ON public.member_branch_access;
CREATE POLICY "mba_select" ON public.member_branch_access
  FOR SELECT USING (
    user_id = auth.uid()
    OR (
      academy_id = (
        SELECT academy_id FROM public.profiles
        WHERE user_id = auth.uid()
        LIMIT 1
      )
      AND EXISTS (
        SELECT 1 FROM public.academy_members am
        WHERE am.user_id   = auth.uid()
          AND am.academy_id = member_branch_access.academy_id
          AND am.role       IN ('owner', 'partner')
      )
    )
  );

-- INSERT: owner/partner only (used by server actions on invitation acceptance)
DROP POLICY IF EXISTS "mba_insert" ON public.member_branch_access;
CREATE POLICY "mba_insert" ON public.member_branch_access
  FOR INSERT WITH CHECK (
    academy_id = (
      SELECT academy_id FROM public.profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
    AND EXISTS (
      SELECT 1 FROM public.academy_members
      WHERE user_id   = auth.uid()
        AND academy_id = member_branch_access.academy_id
        AND role       IN ('owner', 'partner')
    )
  );

-- DELETE: owner/partner only
DROP POLICY IF EXISTS "mba_delete" ON public.member_branch_access;
CREATE POLICY "mba_delete" ON public.member_branch_access
  FOR DELETE USING (
    academy_id = (
      SELECT academy_id FROM public.profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
    AND EXISTS (
      SELECT 1 FROM public.academy_members
      WHERE user_id   = auth.uid()
        AND academy_id = member_branch_access.academy_id
        AND role       IN ('owner', 'partner')
    )
  );
