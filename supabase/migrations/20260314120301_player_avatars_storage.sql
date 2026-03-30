-- Migration 28: Create player-avatars storage bucket + RLS policies
-- Safe to re-run (uses IF NOT EXISTS / ON CONFLICT).

-- ── 1. Create bucket ──────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'player-avatars',
  'player-avatars',
  true,
  5242880,  -- 5 MB per file
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
  SET public            = true,
      file_size_limit   = 5242880,
      allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

-- ── 2. RLS policies on storage.objects ───────────────────────────────────────
-- Drop first so migration is idempotent.

DROP POLICY IF EXISTS "public read player avatars"   ON storage.objects;
DROP POLICY IF EXISTS "auth upload player avatars"   ON storage.objects;
DROP POLICY IF EXISTS "auth update player avatars"   ON storage.objects;
DROP POLICY IF EXISTS "auth delete player avatars"   ON storage.objects;

-- Allow anyone to read (needed for <img src="..."> to work without tokens).
CREATE POLICY "public read player avatars"
ON storage.objects FOR SELECT
USING (bucket_id = 'player-avatars');

-- Allow authenticated users to upload new files.
CREATE POLICY "auth upload player avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'player-avatars');

-- Allow authenticated users to overwrite (upsert) existing files.
CREATE POLICY "auth update player avatars"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'player-avatars');

-- Allow authenticated users to delete files (needed when avatar is cleared).
CREATE POLICY "auth delete player avatars"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'player-avatars');
