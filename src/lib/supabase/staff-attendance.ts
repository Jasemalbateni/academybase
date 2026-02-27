import { createClient } from "./browser";
import { resolveAcademyId } from "./academyId";

// ── Types ─────────────────────────────────────────────────────────────────────

export type AttendanceStatus =
  | "present"
  | "late"
  | "absent"
  | "vacation"
  | "excused";

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  present:  "حاضر",
  late:     "متأخر",
  absent:   "غائب",
  vacation: "إجازة",
  excused:  "بعذر",
};

export type DbStaffAttendance = {
  id:                 string;
  academy_id:         string;
  staff_id:           string;
  branch_id:          string;
  date:               string;   // ISO YYYY-MM-DD
  status:             AttendanceStatus;
  deduct_from_salary: boolean;
  deduction_amount:   number;
  notes:              string | null;
  created_at:         string;
  updated_at:         string;
};

export type StaffAttendanceInsert = {
  staff_id:           string;
  branch_id:          string;
  date:               string;
  status:             AttendanceStatus;
  deduct_from_salary: boolean;
  deduction_amount:   number;
  notes?:             string | null;
};

// ── Session count helper ──────────────────────────────────────────────────────

const ARABIC_TO_JS_DAY: Record<string, number> = {
  "الأحد":    0, "الاثنين":  1, "الثلاثاء": 2,
  "الأربعاء": 3, "الخميس":   4, "الجمعة":   5, "السبت":    6,
};

/**
 * Count training sessions in a given month for a branch's schedule.
 * Returns 0 if the branch has no training days configured.
 */
export function countSessionsInMonth(
  year:       number,
  month:      number,
  branchDays: string[]
): number {
  const jsDays = branchDays
    .map((d) => ARABIC_TO_JS_DAY[d])
    .filter((n): n is number => n !== undefined);

  if (jsDays.length === 0) return 0;

  const daysInMonth = new Date(year, month, 0).getDate();
  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const jsDay = new Date(year, month - 1, d).getDay();
    if (jsDays.includes(jsDay)) count++;
  }
  return count;
}

/**
 * Compute deduction amount for one session:
 *   salary / sessions_in_month
 * Returns 0 if salary or sessions cannot be determined.
 */
export function computeSessionDeduction(
  monthlySalary: number,
  year:          number,
  month:         number,
  branchDays:    string[]
): number {
  if (!monthlySalary || monthlySalary <= 0) return 0;
  const sessionCount = countSessionsInMonth(year, month, branchDays);
  if (sessionCount <= 0) return 0;
  return Math.round((monthlySalary / sessionCount) * 100) / 100;
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

/**
 * List staff attendance records by exact date or month (YYYY-MM or YYYY-MM-DD).
 */
export async function listStaffAttendance(
  dateOrMonth: string
): Promise<DbStaffAttendance[]> {
  const supabase   = createClient();
  const academyId  = await resolveAcademyId();

  let query = supabase
    .from("staff_attendance")
    .select("*")
    .eq("academy_id", academyId);

  if (dateOrMonth.length === 7) {
    // Month filter
    const [y, m] = dateOrMonth.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    query = query
      .gte("date", `${dateOrMonth}-01`)
      .lte("date", `${dateOrMonth}-${String(lastDay).padStart(2, "0")}`);
  } else {
    query = query.eq("date", dateOrMonth);
  }

  const { data, error } = await query.order("date", { ascending: false });
  if (error) throw new Error(`${error.message} [${error.code}]`);
  return (data ?? []) as DbStaffAttendance[];
}

/**
 * Upsert a staff attendance record.
 * Conflict key: (staff_id, branch_id, date).
 */
export async function upsertStaffAttendance(
  payload: StaffAttendanceInsert
): Promise<DbStaffAttendance> {
  const supabase  = createClient();
  const academyId = await resolveAcademyId();

  const { data, error } = await supabase
    .from("staff_attendance")
    .upsert(
      {
        ...payload,
        academy_id:  academyId,
        updated_at:  new Date().toISOString(),
        // Ensure deduction_amount is 0 when deduct_from_salary is false or status is present
        deduction_amount:
          payload.deduct_from_salary && payload.status !== "present"
            ? payload.deduction_amount
            : 0,
      },
      { onConflict: "staff_id,branch_id,date" }
    )
    .select()
    .single();

  if (error) throw new Error(`${error.message} [${error.code}]`);
  return data as DbStaffAttendance;
}

/**
 * Bulk upsert attendance records (e.g. "Mark All Present").
 * Idempotent: safe to call repeatedly for the same (staff_id, branch_id, date).
 */
export async function bulkUpsertStaffAttendance(
  records: StaffAttendanceInsert[]
): Promise<DbStaffAttendance[]> {
  if (records.length === 0) return [];

  const supabase  = createClient();
  const academyId = await resolveAcademyId();

  const rows = records.map((r) => ({
    ...r,
    academy_id:       academyId,
    updated_at:       new Date().toISOString(),
    deduction_amount: r.deduct_from_salary && r.status !== "present"
      ? r.deduction_amount
      : 0,
  }));

  const { data, error } = await supabase
    .from("staff_attendance")
    .upsert(rows, { onConflict: "staff_id,branch_id,date" })
    .select();

  if (error) throw new Error(`${error.message} [${error.code}]`);
  return (data ?? []) as DbStaffAttendance[];
}

/**
 * Delete a staff attendance record by id.
 */
export async function deleteStaffAttendance(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("staff_attendance")
    .delete()
    .eq("id", id);
  if (error) throw new Error(`${error.message} [${error.code}]`);
}
