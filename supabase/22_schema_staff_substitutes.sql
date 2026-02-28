-- ── Migration 22: staff_substitutes ─────────────────────────────────────────
-- Tracks substitute coaches assigned when a staff member is absent/vacation.
-- UNIQUE(staff_id, branch_id, date) so one substitute per absence slot.
-- RLS: SELECT all members; INSERT/UPDATE/DELETE owner+admin only

CREATE TABLE IF NOT EXISTS staff_substitutes (
  id                   uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
  academy_id           uuid         NOT NULL REFERENCES academies(id) ON DELETE CASCADE,
  staff_id             uuid         NOT NULL REFERENCES staff(id)     ON DELETE CASCADE,
  branch_id            uuid         NOT NULL REFERENCES branches(id)  ON DELETE CASCADE,
  date                 date         NOT NULL,
  substitute_staff_id  uuid         REFERENCES staff(id) ON DELETE SET NULL,
  substitute_name      text         NOT NULL,
  payment_amount       numeric(10,3) NOT NULL DEFAULT 0,
  note                 text,
  finance_tx_id        uuid,
  created_at           timestamptz  DEFAULT now(),
  UNIQUE(staff_id, branch_id, date)
);

ALTER TABLE staff_substitutes ENABLE ROW LEVEL SECURITY;

-- SELECT: all academy members
CREATE POLICY "staff_substitutes_select" ON staff_substitutes
  FOR SELECT USING (
    academy_id IN (
      SELECT academy_id FROM profiles WHERE user_id = auth.uid()
    )
  );

-- INSERT: owner + admin
CREATE POLICY "staff_substitutes_insert" ON staff_substitutes
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM academy_members
      WHERE academy_id = staff_substitutes.academy_id
        AND user_id    = auth.uid()
        AND role       IN ('owner', 'admin')
    )
  );

-- UPDATE: owner + admin
CREATE POLICY "staff_substitutes_update" ON staff_substitutes
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM academy_members
      WHERE academy_id = staff_substitutes.academy_id
        AND user_id    = auth.uid()
        AND role       IN ('owner', 'admin')
    )
  );

-- DELETE: owner + admin
CREATE POLICY "staff_substitutes_delete" ON staff_substitutes
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM academy_members
      WHERE academy_id = staff_substitutes.academy_id
        AND user_id    = auth.uid()
        AND role       IN ('owner', 'admin')
    )
  );
