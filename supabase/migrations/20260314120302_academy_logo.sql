-- Migration: Add logo_url to academies + create academy-logos storage bucket
-- Safe to re-run (uses IF NOT EXISTS / ON CONFLICT).

-- ── 1. Add logo_url column to academies ───────────────────────────────────────
ALTER TABLE public.academies ADD COLUMN IF NOT EXISTS logo_url text;

-- ── 2. Create storage bucket ──────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'academy-logos',
  'academy-logos',
  true,
  2097152,  -- 2 MB per file
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
  SET public             = true,
      file_size_limit    = 2097152,
      allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

-- ── 3. RLS policies on storage.objects ───────────────────────────────────────
-- Drop first so migration is idempotent.
DROP POLICY IF EXISTS "public read academy logos"  ON storage.objects;
DROP POLICY IF EXISTS "auth upload academy logos"  ON storage.objects;
DROP POLICY IF EXISTS "auth update academy logos"  ON storage.objects;
DROP POLICY IF EXISTS "auth delete academy logos"  ON storage.objects;

-- Allow anyone to read (needed for <img src="..."> without auth tokens).
CREATE POLICY "public read academy logos"
ON storage.objects FOR SELECT
USING (bucket_id = 'academy-logos');

-- Allow authenticated users to upload new files.
CREATE POLICY "auth upload academy logos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'academy-logos');

-- Allow authenticated users to overwrite existing files (upsert).
CREATE POLICY "auth update academy logos"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'academy-logos');

-- Allow authenticated users to delete files.
CREATE POLICY "auth delete academy logos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'academy-logos');
