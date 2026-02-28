import { createClient } from "./browser";
import { resolveAcademyId } from "./academyId";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CalendarEventType =
  | "training"
  | "match"
  | "canceled"
  | "special_event";

export type DbCalendarEvent = {
  id: string;
  academy_id: string;
  branch_id: string | null;
  title: string;
  date: string;             // ISO YYYY-MM-DD
  event_type: CalendarEventType;
  note: string | null;
  created_by: string | null;
  created_at: string;
  /** True when this training event was flagged to consume a session from eligible حصص players. */
  deduct_sessions: boolean;
};

export type CalendarEventInsert = {
  branch_id: string | null;
  title: string;
  date: string;
  event_type: CalendarEventType;
  note?: string | null;
  /** Persist deduction intent so deletes can restore consumed sessions. */
  deduct_sessions?: boolean;
};

export const eventTypeLabel: Record<CalendarEventType, string> = {
  training:      "تدريب",
  match:         "مباراة",
  canceled:      "ملغي",
  special_event: "حدث خاص",
};

export const eventTypeColor: Record<CalendarEventType, string> = {
  training:
    "text-emerald-300 bg-emerald-400/10 border border-emerald-400/20",
  match:
    "text-blue-300 bg-blue-400/10 border border-blue-400/20",
  canceled:
    "text-red-300 bg-red-500/10 border border-red-500/20",
  special_event:
    "text-amber-300 bg-amber-400/10 border border-amber-400/20",
};

// ── CRUD ──────────────────────────────────────────────────────────────────────

/**
 * List all calendar events for the academy within [fromDate, toDate] inclusive.
 */
export async function listCalendarEvents(
  fromDate: string,
  toDate: string
): Promise<DbCalendarEvent[]> {
  const supabase    = createClient();
  const academyId   = await resolveAcademyId();

  const { data, error } = await supabase
    .from("calendar_events")
    .select("*")
    .eq("academy_id", academyId)
    .gte("date", fromDate)
    .lte("date", toDate)
    .order("date", { ascending: true });

  if (error) throw new Error(`${error.message} [${error.code}]`);
  return (data ?? []) as DbCalendarEvent[];
}

export async function createCalendarEvent(
  payload: CalendarEventInsert
): Promise<DbCalendarEvent> {
  const supabase  = createClient();
  const academyId = await resolveAcademyId();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("غير مصرح — يرجى تسجيل الدخول.");

  const { data, error } = await supabase
    .from("calendar_events")
    .insert({ ...payload, academy_id: academyId, created_by: user.id })
    .select()
    .single();

  if (error) throw new Error(`${error.message} [${error.code}]`);
  return data as DbCalendarEvent;
}

export async function updateCalendarEvent(
  id: string,
  payload: Partial<CalendarEventInsert>
): Promise<DbCalendarEvent> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("calendar_events")
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(`${error.message} [${error.code}]`);
  return data as DbCalendarEvent;
}

export async function deleteCalendarEvent(id: string): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase
    .from("calendar_events")
    .delete()
    .eq("id", id);

  if (error) throw new Error(`${error.message} [${error.code}]`);
}
