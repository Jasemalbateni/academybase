// All persistent data is stored in Supabase.
// This file previously contained localStorage helpers — those have been removed.

/** Generates a lightweight client-side temporary ID (not persisted). */
export function uid(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}
