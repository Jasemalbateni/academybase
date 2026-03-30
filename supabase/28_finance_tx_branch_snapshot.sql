-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 28: finance_tx branch integrity
--
-- Adds branch_name_snapshot TEXT column so historical records retain their
-- branch display name even if the branch is later renamed or deleted.
-- Also adds a CHECK constraint to validate the branch_id format.
-- Safe to run multiple times (idempotent).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add branch_name_snapshot column (if not already present)
ALTER TABLE public.finance_tx
  ADD COLUMN IF NOT EXISTS branch_name_snapshot TEXT;

-- 2. Populate snapshot from branches table for existing non-"all" rows
UPDATE public.finance_tx ft
SET    branch_name_snapshot = b.name
FROM   public.branches b
WHERE  ft.branch_id = b.id::text
  AND  ft.branch_name_snapshot IS NULL;

-- 3. Mark academy-wide rows explicitly
UPDATE public.finance_tx
SET    branch_name_snapshot = 'الأكاديمية (عام)'
WHERE  branch_id = 'all'
  AND  branch_name_snapshot IS NULL;

-- 4. Add CHECK: branch_id must be 'all' or a valid UUID string
--    (safe guard against free-text corruption)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE  conname = 'finance_tx_branch_id_format'
      AND  conrelid = 'public.finance_tx'::regclass
  ) THEN
    ALTER TABLE public.finance_tx
      ADD CONSTRAINT finance_tx_branch_id_format
      CHECK (
        branch_id = 'all'
        OR branch_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      );
  END IF;
END$$;

-- 5. Trigger: auto-fill branch_name_snapshot on INSERT/UPDATE
CREATE OR REPLACE FUNCTION public.fn_fill_branch_name_snapshot()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.branch_id = 'all' THEN
    NEW.branch_name_snapshot := 'الأكاديمية (عام)';
  ELSIF NEW.branch_name_snapshot IS NULL THEN
    SELECT name INTO NEW.branch_name_snapshot
    FROM   public.branches
    WHERE  id = NEW.branch_id::uuid;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fill_branch_name_snapshot ON public.finance_tx;
CREATE TRIGGER trg_fill_branch_name_snapshot
  BEFORE INSERT OR UPDATE OF branch_id ON public.finance_tx
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_fill_branch_name_snapshot();
