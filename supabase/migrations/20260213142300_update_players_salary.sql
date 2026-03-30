-- ── Migration 23: is_paused + salary/deduction constraints ──────────────────

-- Feature C: player pause/resume
ALTER TABLE players ADD COLUMN IF NOT EXISTS is_paused boolean NOT NULL DEFAULT false;

-- Feature A: non-negative salary constraint on staff
ALTER TABLE staff DROP CONSTRAINT IF EXISTS staff_salary_non_negative;
ALTER TABLE staff ADD CONSTRAINT staff_salary_non_negative CHECK (monthly_salary >= 0);

-- Feature A: non-negative deduction constraint on staff_attendance (if table exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'staff_attendance'
  ) THEN
    ALTER TABLE staff_attendance DROP CONSTRAINT IF EXISTS deduction_non_negative;
    ALTER TABLE staff_attendance
      ADD CONSTRAINT deduction_non_negative CHECK (deduction_amount >= 0);
  END IF;
END $$;
