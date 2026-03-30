-- Migration 27: Add avatar_url column to players table
-- Stores the public URL of the player's profile image uploaded to Supabase Storage.
-- NULL means no image (initials fallback shown in UI).

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT NULL;
