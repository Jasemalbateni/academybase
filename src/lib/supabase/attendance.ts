import { createClient } from "./browser";
import { resolveAcademyId } from "./academyId";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DbAttendance = {
  id: string;
  academy_id: string;
  player_id: string;
  branch_id: string | null;
  date: string;          // ISO YYYY-MM-DD
  present: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
};

// ── CRUD ──────────────────────────────────────────────────────────────────────

/**
 * List all attendance records for the academy within a given month (YYYY-MM).
 * Returns every record whether present=true or present=false.
 */
export async function listAttendanceByMonth(
  month: string
): Promise<DbAttendance[]> {
  const supabase = createClient();
  const academyId = await resolveAcademyId();

  const [year, mon] = month.split("-").map(Number);
  const startDate = `${month}-01`;
  const lastDay = new Date(year, mon, 0).getDate(); // last day of month
  const endDate = `${month}-${String(lastDay).padStart(2, "0")}`;

  const { data, error } = await supabase
    .from("attendance")
    .select("*")
    .eq("academy_id", academyId)
    .gte("date", startDate)
    .lte("date", endDate)
    .order("date", { ascending: true });

  if (error) throw new Error(`${error.message} [${error.code}]`);
  return (data ?? []) as DbAttendance[];
}

/**
 * List all attendance records for the academy within an arbitrary date range.
 * Uses the existing (academy_id, player_id, date) index — single round-trip.
 */
export async function listAttendanceByDateRange(
  fromDate: string, // ISO YYYY-MM-DD inclusive
  toDate:   string, // ISO YYYY-MM-DD inclusive
): Promise<DbAttendance[]> {
  const supabase  = createClient();
  const academyId = await resolveAcademyId();

  const { data, error } = await supabase
    .from("attendance")
    .select("*")
    .eq("academy_id", academyId)
    .gte("date", fromDate)
    .lte("date", toDate)
    .order("date", { ascending: true });

  if (error) throw new Error(`${error.message} [${error.code}]`);
  return (data ?? []) as DbAttendance[];
}

/**
 * Upsert a single attendance record.
 * Conflict key: (academy_id, player_id, date).
 */
export async function upsertAttendance(
  playerId: string,
  branchId: string | null,
  date: string, // ISO YYYY-MM-DD
  present: boolean
): Promise<void> {
  const supabase = createClient();
  const academyId = await resolveAcademyId();

  const { error } = await supabase
    .from("attendance")
    .upsert(
      {
        academy_id: academyId,
        player_id:  playerId,
        branch_id:  branchId,
        date,
        present,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "academy_id,player_id,date" }
    );

  if (error) throw new Error(`${error.message} [${error.code}]`);
}
