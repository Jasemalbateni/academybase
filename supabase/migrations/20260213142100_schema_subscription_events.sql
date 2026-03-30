-- ── Migration 21: subscription_events ───────────────────────────────────────
-- Tracks the full lifecycle of player subscriptions.
-- event_type: first_registration | renewal | extension | paused | resumed | expired | returned
-- RLS: SELECT/INSERT all academy members; DELETE owner+admin only

CREATE TABLE IF NOT EXISTS subscription_events (
  id                uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  academy_id        uuid        NOT NULL REFERENCES academies(id) ON DELETE CASCADE,
  player_id         uuid        NOT NULL REFERENCES players(id)   ON DELETE CASCADE,
  event_type        text        NOT NULL CHECK (event_type IN (
    'first_registration','renewal','extension','paused','resumed','expired','returned'
  )),
  event_date        date        NOT NULL DEFAULT CURRENT_DATE,
  extend_days       integer,
  payment_id        uuid        REFERENCES payments(id) ON DELETE SET NULL,
  note              text,
  created_by        uuid,
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscription_events_academy_player_date
  ON subscription_events(academy_id, player_id, event_date);

ALTER TABLE subscription_events ENABLE ROW LEVEL SECURITY;

-- SELECT: all academy members
CREATE POLICY "subscription_events_select" ON subscription_events
  FOR SELECT USING (
    academy_id IN (
      SELECT academy_id FROM profiles WHERE user_id = auth.uid()
    )
  );

-- INSERT: all academy members (subscription events are created during normal player ops)
CREATE POLICY "subscription_events_insert" ON subscription_events
  FOR INSERT WITH CHECK (
    academy_id IN (
      SELECT academy_id FROM profiles WHERE user_id = auth.uid()
    )
  );

-- DELETE: owner + admin only
CREATE POLICY "subscription_events_delete" ON subscription_events
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM academy_members
      WHERE academy_id = subscription_events.academy_id
        AND user_id     = auth.uid()
        AND role        IN ('owner', 'admin')
    )
  );
