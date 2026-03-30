-- Migration: Notifications table for persistent read/unread alert state
-- Synced from computeInsights() output on the client.
-- UNIQUE(academy_id, insight_id) ensures one row per insight per academy.

CREATE TABLE IF NOT EXISTS public.notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  academy_id  UUID NOT NULL REFERENCES public.academies(id) ON DELETE CASCADE,
  insight_id  TEXT NOT NULL,
  title       TEXT NOT NULL,
  description TEXT,
  severity    TEXT NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
  scope_type  TEXT NOT NULL DEFAULT 'academy',
  scope_id    TEXT,        -- player_id or branch_id (null for academy scope)
  scope_name  TEXT,        -- player_name or branch_name
  is_read     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(academy_id, insight_id)
);

-- Index for fast unread count query (used by sidebar badge)
CREATE INDEX IF NOT EXISTS idx_notifications_academy_unread
  ON public.notifications(academy_id, is_read)
  WHERE is_read = false;

-- RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- All academy members can read their own notifications
CREATE POLICY "notifications_select"
  ON public.notifications FOR SELECT
  USING (
    academy_id = (SELECT academy_id FROM public.profiles WHERE user_id = auth.uid())
  );

-- All academy members can insert notifications (insights sync)
CREATE POLICY "notifications_insert"
  ON public.notifications FOR INSERT
  WITH CHECK (
    academy_id = (SELECT academy_id FROM public.profiles WHERE user_id = auth.uid())
  );

-- All academy members can mark notifications as read
CREATE POLICY "notifications_update"
  ON public.notifications FOR UPDATE
  USING (
    academy_id = (SELECT academy_id FROM public.profiles WHERE user_id = auth.uid())
  );

-- All academy members can delete their own notifications
CREATE POLICY "notifications_delete"
  ON public.notifications FOR DELETE
  USING (
    academy_id = (SELECT academy_id FROM public.profiles WHERE user_id = auth.uid())
  );
