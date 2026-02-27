-- =============================================================================
-- 08 · Invitations table
-- Run after 07_schema_finance.sql
--
-- Enables invitation-based academy membership.
-- Owner invites by email; invited user registers or logs in and accepts.
-- Tokens are 32-byte random values (hex) — effectively unguessable.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.invitations (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  academy_id  uuid        NOT NULL REFERENCES public.academies(id) ON DELETE CASCADE,
  email       text        NOT NULL,
  role        text        NOT NULL DEFAULT 'staff',
  token       text        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  invited_by  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL DEFAULT now() + interval '7 days',
  accepted_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT  invitations_role_check CHECK (role IN ('admin', 'staff'))
);

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- Indexes for fast token and email lookups
CREATE INDEX IF NOT EXISTS invitations_academy_idx ON public.invitations (academy_id);
CREATE INDEX IF NOT EXISTS invitations_token_idx   ON public.invitations (token);
CREATE INDEX IF NOT EXISTS invitations_email_idx   ON public.invitations (email);

-- ── RLS Policies ──────────────────────────────────────────────────────────────

-- Owner can create invitations for their own academy
DROP POLICY IF EXISTS "invitations_insert" ON public.invitations;
CREATE POLICY "invitations_insert" ON public.invitations
  FOR INSERT WITH CHECK (
    invited_by = auth.uid()
    AND academy_id = (
      SELECT academy_id FROM public.profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
    AND EXISTS (
      SELECT 1 FROM public.academy_members
      WHERE user_id  = auth.uid()
        AND academy_id = invitations.academy_id
        AND role = 'owner'
    )
  );

-- Owner sees all academy invitations; invitee sees their own (for acceptance)
DROP POLICY IF EXISTS "invitations_select" ON public.invitations;
CREATE POLICY "invitations_select" ON public.invitations
  FOR SELECT USING (
    -- Owner can see all for their academy
    (
      academy_id = (
        SELECT academy_id FROM public.profiles
        WHERE user_id = auth.uid()
        LIMIT 1
      )
      AND EXISTS (
        SELECT 1 FROM public.academy_members
        WHERE user_id  = auth.uid()
          AND academy_id = invitations.academy_id
          AND role = 'owner'
      )
    )
    -- Invited user can see their own invitation (to accept it)
    OR email = (
      SELECT email FROM auth.users
      WHERE id = auth.uid()
    )
  );

-- Invitee marks the invitation as accepted
DROP POLICY IF EXISTS "invitations_update" ON public.invitations;
CREATE POLICY "invitations_update" ON public.invitations
  FOR UPDATE USING (
    email = (
      SELECT email FROM auth.users
      WHERE id = auth.uid()
    )
    AND accepted_at IS NULL
    AND expires_at > now()
  );

-- Owner can revoke (delete) pending invitations
DROP POLICY IF EXISTS "invitations_delete" ON public.invitations;
CREATE POLICY "invitations_delete" ON public.invitations
  FOR DELETE USING (
    academy_id = (
      SELECT academy_id FROM public.profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
    AND EXISTS (
      SELECT 1 FROM public.academy_members
      WHERE user_id  = auth.uid()
        AND academy_id = invitations.academy_id
        AND role = 'owner'
    )
  );
