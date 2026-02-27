-- =============================================================================
-- 18 · Calendar events table + RLS
-- Run after 17_fix_academies_select_rls.sql
--
-- Each calendar event belongs to an academy, optionally scoped to a branch.
-- Event types: training | match | canceled | special_event
--
-- Permissions:
--   SELECT  : all academy members (read-only for admin_staff)
--   INSERT  : owner/partner (any event) or branch_manager (their branches only)
--   UPDATE  : same as INSERT
--   DELETE  : same as INSERT
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.calendar_events (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  academy_id   uuid        NOT NULL REFERENCES public.academies(id) ON DELETE CASCADE,
  branch_id    uuid        REFERENCES public.branches(id) ON DELETE CASCADE,
  title        text        NOT NULL,
  date         date        NOT NULL,
  event_type   text        NOT NULL
                           CHECK (event_type IN ('training', 'match', 'canceled', 'special_event')),
  note         text,
  created_by   uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_calendar_events_academy_date
  ON public.calendar_events (academy_id, date);

CREATE INDEX IF NOT EXISTS idx_calendar_events_branch_date
  ON public.calendar_events (branch_id, date);

COMMENT ON TABLE public.calendar_events IS
  'Academy calendar events: training sessions, matches, cancellations, special events.';

-- ── RLS Policies ──────────────────────────────────────────────────────────────

-- SELECT: all academy members can view events
DROP POLICY IF EXISTS "calendar_events_select" ON public.calendar_events;
CREATE POLICY "calendar_events_select" ON public.calendar_events
  FOR SELECT USING (
    academy_id = public.my_academy_id()
    AND public.is_academy_member(academy_id)
  );

-- INSERT: owner/partner full access; branch_manager for their assigned branches
DROP POLICY IF EXISTS "calendar_events_insert" ON public.calendar_events;
CREATE POLICY "calendar_events_insert" ON public.calendar_events
  FOR INSERT WITH CHECK (
    academy_id = public.my_academy_id()
    AND (
      public.is_owner_or_partner(academy_id)
      OR (
        public.is_branch_manager(academy_id)
        AND branch_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.member_branch_access
          WHERE user_id    = auth.uid()
            AND academy_id = calendar_events.academy_id
            AND branch_id  = calendar_events.branch_id
        )
      )
    )
  );

-- UPDATE: same rules as INSERT
DROP POLICY IF EXISTS "calendar_events_update" ON public.calendar_events;
CREATE POLICY "calendar_events_update" ON public.calendar_events
  FOR UPDATE USING (
    academy_id = public.my_academy_id()
    AND (
      public.is_owner_or_partner(academy_id)
      OR (
        public.is_branch_manager(academy_id)
        AND branch_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.member_branch_access
          WHERE user_id    = auth.uid()
            AND academy_id = calendar_events.academy_id
            AND branch_id  = calendar_events.branch_id
        )
      )
    )
  );

-- DELETE: same rules as INSERT
DROP POLICY IF EXISTS "calendar_events_delete" ON public.calendar_events;
CREATE POLICY "calendar_events_delete" ON public.calendar_events
  FOR DELETE USING (
    academy_id = public.my_academy_id()
    AND (
      public.is_owner_or_partner(academy_id)
      OR (
        public.is_branch_manager(academy_id)
        AND branch_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.member_branch_access
          WHERE user_id    = auth.uid()
            AND academy_id = calendar_events.academy_id
            AND branch_id  = calendar_events.branch_id
        )
      )
    )
  );
