import { createClient } from "./browser";
import { resolveAcademyId } from "./academyId";
import { upsertAutoFinanceTx, updateFinanceTx } from "./finance";
import { countSessionsInMonth } from "./staff-attendance";

// ── Types ─────────────────────────────────────────────────────────────────────

export type SessionStatus = "scheduled" | "cancelled" | "completed";

export type DbSession = {
  id:         string;
  academy_id: string;
  branch_id:  string;
  date:       string;   // ISO YYYY-MM-DD
  status:     SessionStatus;
  field_cost: number;
  coach_cost: number;
  revenue:    number;
  notes:      string | null;
  created_at: string;
  updated_at: string;
};

export type SessionInsert = {
  branch_id:  string;
  date:       string;
  status:     SessionStatus;
  field_cost: number;
  coach_cost: number;
  revenue:    number;
  notes?:     string | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * For per_session branches, monthly_rent IS the per-session cost.
 * Returns the cost directly — no division needed.
 * Parameters year/month/branchDays are kept for API compatibility.
 */
export function computeFieldCostPerSession(
  monthlyRent: number,
  _year:       number,
  _month:      number,
  _branchDays: string[]
): number {
  if (!monthlyRent || monthlyRent <= 0) return 0;
  return monthlyRent;
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

/**
 * List sessions within a date range (inclusive).
 */
export async function listSessions(
  fromDate: string,
  toDate:   string
): Promise<DbSession[]> {
  const supabase  = createClient();
  const academyId = await resolveAcademyId();

  const { data, error } = await supabase
    .from("sessions")
    .select("*")
    .eq("academy_id", academyId)
    .gte("date", fromDate)
    .lte("date", toDate)
    .order("date", { ascending: true });

  if (error) throw new Error(`${error.message} [${error.code}]`);
  return (data ?? []) as DbSession[];
}

/**
 * Upsert a session record. Conflict key: (branch_id, date).
 * When status = 'cancelled' and field_cost = 0, also creates a zero-cost
 * finance entry (auto_key = session-field:{branchId}:{date}) to reflect
 * the cancellation saving in financial reports.
 */
export async function upsertSession(payload: SessionInsert): Promise<DbSession> {
  const supabase  = createClient();
  const academyId = await resolveAcademyId();

  const { data, error } = await supabase
    .from("sessions")
    .upsert(
      { ...payload, academy_id: academyId, updated_at: new Date().toISOString() },
      { onConflict: "branch_id,date" }
    )
    .select()
    .single();

  if (error) throw new Error(`${error.message} [${error.code}]`);
  const row = data as DbSession;

  // Sync finance entry for cancelled session field cost
  syncSessionFieldFinance(row, academyId).catch((e) =>
    console.error("[sessions] finance sync error:", e)
  );

  return row;
}

/**
 * Delete a session record and suppress the linked finance entry.
 */
export async function deleteSession(id: string): Promise<void> {
  const supabase = createClient();

  // Get the session first to find branch_id and date for auto_key
  const { data: sess } = await supabase
    .from("sessions")
    .select("branch_id, date")
    .eq("id", id)
    .maybeSingle();

  if (sess) {
    await suppressSessionFieldFinance(sess.branch_id as string, sess.date as string);
  }

  const { error } = await supabase.from("sessions").delete().eq("id", id);
  if (error) throw new Error(`${error.message} [${error.code}]`);
}

/**
 * Delete a session by (branch_id, date) — convenience for calendar integration.
 */
export async function deleteSessionByBranchDate(
  branchId: string,
  date:     string
): Promise<void> {
  const supabase  = createClient();
  const academyId = await resolveAcademyId();

  await suppressSessionFieldFinance(branchId, date);

  const { error } = await supabase
    .from("sessions")
    .delete()
    .eq("academy_id", academyId)
    .eq("branch_id", branchId)
    .eq("date", date);

  if (error) throw new Error(`${error.message} [${error.code}]`);
}

// ── Finance sync helpers ──────────────────────────────────────────────────────

/**
 * Sync the field cost finance entry for a cancelled session.
 * Creates a zero-amount auto entry to reflect in reports that this
 * session incurred no field cost.
 */
async function syncSessionFieldFinance(
  row:       DbSession,
  academyId: string
): Promise<void> {
  void academyId; // Used implicitly via upsertAutoFinanceTx

  const autoKey   = `session-field:${row.branch_id}:${row.date}`;
  const [year, month] = row.date.split("-");
  const monthKey  = `${year}-${month}`;

  if (row.status === "cancelled" && row.field_cost === 0) {
    // Zero-cost entry: shows in finance that this session had no field charge
    await upsertAutoFinanceTx({
      auto_key:   autoKey,
      month:      monthKey,
      date:       row.date,
      type:       "مصروف",
      branch_id:  row.branch_id,
      category:   "حجز ملعب",
      amount:     0,
      note:       "حصة ملغاة — تم توفير تكلفة الملعب",
      source:     "auto",
    });
  } else if (row.status === "cancelled" && row.field_cost > 0) {
    // Cancelled but field cost kept (checkbox unchecked) — create normal cost entry
    await upsertAutoFinanceTx({
      auto_key:   autoKey,
      month:      monthKey,
      date:       row.date,
      type:       "مصروف",
      branch_id:  row.branch_id,
      category:   "حجز ملعب",
      amount:     row.field_cost,
      note:       "حصة ملغاة — تكلفة ملعب",
      source:     "auto",
    });
  } else {
    // Session not cancelled — suppress any previously created entry
    await suppressSessionFieldFinance(row.branch_id, row.date);
  }
}

/**
 * Suppress the field cost finance entry for a given (branch_id, date).
 * Safe to call even if no entry exists.
 */
async function suppressSessionFieldFinance(
  branchId: string,
  date:     string
): Promise<void> {
  const autoKey  = `session-field:${branchId}:${date}`;
  const supabase = createClient();

  let academyId: string;
  try {
    academyId = await resolveAcademyId();
  } catch {
    return;
  }

  const { data } = await supabase
    .from("finance_tx")
    .select("id, source")
    .eq("academy_id", academyId)
    .eq("auto_key", autoKey)
    .maybeSingle();

  if (data?.id && data.source === "auto") {
    await updateFinanceTx(data.id, { source: "suppressed", amount: 0 });
  }
}
