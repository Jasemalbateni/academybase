import { createClient } from "./browser";
import { resolveAcademyId } from "./academyId";

// ── Types ─────────────────────────────────────────────────────────────────────

export type SubscriptionEventType =
  | "first_registration"
  | "renewal"
  | "extension"
  | "paused"
  | "resumed"
  | "expired"
  | "returned";

export type DbSubscriptionEvent = {
  id: string;
  academy_id: string;
  player_id: string;
  event_type: SubscriptionEventType;
  event_date: string;        // ISO YYYY-MM-DD
  extend_days: number | null;
  payment_id: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
};

export type SubscriptionEventInsert = {
  player_id: string;
  event_type: SubscriptionEventType;
  event_date: string;
  extend_days?: number | null;
  payment_id?: string | null;
  note?: string | null;
};

// ── CRUD ──────────────────────────────────────────────────────────────────────

/**
 * Creates a new subscription lifecycle event.
 * Returns null silently if the migration hasn't been applied yet (table missing).
 */
export async function createSubscriptionEvent(
  payload: SubscriptionEventInsert
): Promise<DbSubscriptionEvent | null> {
  const supabase    = createClient();
  const academyId   = await resolveAcademyId();

  const { data, error } = await supabase
    .from("subscription_events")
    .insert({ ...payload, academy_id: academyId })
    .select()
    .single();

  if (error) {
    // Gracefully handle missing table — migration may not have been applied yet
    if (
      error.code === "PGRST205" ||
      error.code === "42P01" ||
      (error.message && error.message.includes("subscription_events"))
    ) {
      return null;
    }
    throw new Error(`${error.message} [${error.code}]`);
  }

  return data as DbSubscriptionEvent;
}

/**
 * Returns all subscription events for a player, sorted by event_date ascending.
 * Returns [] silently if the migration hasn't been applied yet.
 */
export async function listSubscriptionEvents(
  playerId: string
): Promise<DbSubscriptionEvent[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("subscription_events")
    .select("*")
    .eq("player_id", playerId)
    .order("event_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    if (
      error.code === "PGRST205" ||
      error.code === "42P01" ||
      (error.message && error.message.includes("subscription_events"))
    ) {
      return [];
    }
    throw new Error(`${error.message} [${error.code}]`);
  }

  return (data ?? []) as DbSubscriptionEvent[];
}
