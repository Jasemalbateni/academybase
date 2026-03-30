import { createClient } from "./browser";
import { resolveAcademyId } from "./academyId";
import { upsertAutoFinanceTx, updateFinanceTx, deleteFinanceTx } from "./finance";
import { countSessionsInMonth, computeSessionDeduction } from "./staff-attendance";
import { extendBranchPlayersByOneSession, reduceSpecificPlayersByOneSession } from "./players";

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

  // Sync finance entries for cancelled session field cost + rent aggregate
  syncSessionFieldFinance(row, academyId).catch((e) =>
    console.error("[sessions] finance sync error:", e)
  );

  return row;
}

/**
 * Delete a session record and suppress the linked finance entry.
 */
export async function deleteSession(id: string): Promise<void> {
  const supabase  = createClient();
  const academyId = await resolveAcademyId();

  // Get the session first to find branch_id and date for auto_key
  const { data: sess } = await supabase
    .from("sessions")
    .select("branch_id, date")
    .eq("id", id)
    .maybeSingle();

  if (sess) {
    await suppressSessionFieldFinance(sess.branch_id as string, sess.date as string);
    // UPDATE to scheduled first (branch_manager can UPDATE but not DELETE)
    await supabase
      .from("sessions")
      .update({ status: "scheduled", updated_at: new Date().toISOString() })
      .eq("id", id);
  }

  // DELETE (owner/partner only — silently ignored for other roles)
  await supabase.from("sessions").delete().eq("id", id);

  if (sess) {
    const monthKey = (sess.date as string).slice(0, 7);
    // Re-sync rent aggregate now that this session is gone
    syncRentAggregateForBranch(sess.branch_id as string, monthKey, academyId).catch((e) =>
      console.error("[sessions] rent aggregate sync error:", e)
    );
    // Restore coach salary Finance entries
    restoreCoachSalaryForBranch(sess.branch_id as string, sess.date as string, academyId).catch((e) =>
      console.error("[sessions] coach salary restore error:", e)
    );
  }
}

/**
 * Delete a session by (branch_id, date) — convenience for calendar integration.
 *
 * Strategy: UPDATE status → 'scheduled' first (allowed by branch_manager RLS),
 * THEN attempt DELETE (owner/partner only).  If DELETE is blocked by RLS the
 * UPDATE already ensures the row is no longer counted as 'cancelled', so the
 * Finance aggregate and sub-items are immediately correct for all roles.
 */
export async function deleteSessionByBranchDate(
  branchId: string,
  date:     string
): Promise<void> {
  const supabase  = createClient();
  const academyId = await resolveAcademyId();

  await suppressSessionFieldFinance(branchId, date);

  // Always attempt UPDATE first — works for branch_manager (who cannot DELETE)
  await supabase
    .from("sessions")
    .update({ status: "scheduled", updated_at: new Date().toISOString() })
    .eq("academy_id", academyId)
    .eq("branch_id", branchId)
    .eq("date", date);

  // Then attempt DELETE — succeeds for owner/partner; silently ignored for others
  await supabase
    .from("sessions")
    .delete()
    .eq("academy_id", academyId)
    .eq("branch_id", branchId)
    .eq("date", date);

  const monthKey = date.slice(0, 7);

  // Re-sync rent aggregate (session no longer counted as cancelled)
  syncRentAggregateForBranch(branchId, monthKey, academyId).catch((e) =>
    console.error("[sessions] rent aggregate sync error:", e)
  );

  // Restore coach salary Finance entries (remove no_training deductions)
  restoreCoachSalaryForBranch(branchId, date, academyId).catch((e) =>
    console.error("[sessions] coach salary restore error:", e)
  );
}

// ── Finance sync helpers ──────────────────────────────────────────────────────

/**
 * Sync the field cost finance entry for a cancelled session.
 * Creates a zero-amount auto entry to reflect in reports that this
 * session incurred no field cost.
 * Also re-syncs the per-session rent aggregate so the total expense
 * updates immediately (without requiring a visit to the Finance page).
 */
async function syncSessionFieldFinance(
  row:       DbSession,
  academyId: string
): Promise<void> {
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

  // Re-sync the per-session rent aggregate so expenses update immediately
  // (instead of waiting for the Finance page auto-sync to run).
  await syncRentAggregateForBranch(row.branch_id, monthKey, academyId);
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

/**
 * Re-calculate and upsert the per-session rent aggregate for a branch+month.
 *
 * This is the key piece that was missing: cancelling a session from the
 * Calendar page now immediately updates the rent:{month}:{branchId} entry
 * in finance_tx, so the Dashboard and Finance page both reflect the
 * correct (reduced) expense without needing the Finance page auto-sync
 * to run first.
 *
 * Only acts on per_session rent branches. Fixed-monthly branches are
 * intentionally unaffected — you pay full monthly rent regardless of
 * cancellations.
 *
 * Safe no-op if:
 *  - Branch not found or not per_session
 *  - Rent entry is suppressed or manually overridden by the user
 */
async function syncRentAggregateForBranch(
  branchId:  string,
  monthKey:  string,
  academyId: string
): Promise<void> {
  const supabase = createClient();

  // Fetch branch settings (name + rent config + schedule days)
  const { data: branch } = await supabase
    .from("branches")
    .select("name, rent_type, monthly_rent, days")
    .eq("id", branchId)
    .eq("academy_id", academyId)
    .maybeSingle();

  if (!branch || branch.rent_type !== "per_session" || (branch.monthly_rent as number) <= 0) return;

  const [y, m]    = monthKey.split("-").map(Number);
  const scheduled = countSessionsInMonth(y, m, branch.days as string[]);
  if (scheduled <= 0) return;

  const rentAutoKey = `rent:${monthKey}:${branchId}`;

  // Don't overwrite suppressed or manually-overridden entries
  const { data: existing } = await supabase
    .from("finance_tx")
    .select("id, source, overridden_auto_key")
    .eq("academy_id", academyId)
    .eq("auto_key", rentAutoKey)
    .maybeSingle();

  if (existing?.source === "suppressed") return;
  if (existing?.overridden_auto_key)     return;

  // Count cancelled sessions for this branch in this month from the DB
  const lastDay  = new Date(y, m, 0).getDate();
  const { data: sessionRows } = await supabase
    .from("sessions")
    .select("status")
    .eq("academy_id", academyId)
    .eq("branch_id", branchId)
    .eq("status", "cancelled")
    .gte("date", `${monthKey}-01`)
    .lte("date", `${monthKey}-${String(lastDay).padStart(2, "0")}`);

  const cancelledCount = (sessionRows ?? []).length;
  const actual  = Math.max(0, scheduled - cancelledCount);
  const amount  = Math.round(actual * (branch.monthly_rent as number) * 100) / 100;

  if (amount <= 0) {
    // All sessions cancelled — delete the aggregate entry if it exists
    if (existing?.id) {
      await deleteFinanceTx(existing.id);
    }
    return;
  }

  const noteText = `إيجار ملعب بالحصة — ${branch.name as string} (${actual}/${scheduled} حصص × ${branch.monthly_rent} د.ك)`;

  await upsertAutoFinanceTx({
    auto_key:  rentAutoKey,
    month:     monthKey,
    date:      `${monthKey}-01`,
    type:      "مصروف",
    branch_id: branchId,
    category:  "حجز ملعب",
    amount,
    note:      noteText,
    source:    "auto",
  });
}

// ── Coach salary Finance sync ─────────────────────────────────────────────────

// Internal row types used by both coach sync functions
type StaffRow = {
  id:             string;
  name:           string;
  role:           string;
  job_title:      string | null;
  monthly_salary: number;
  branch_ids:     string[];
};

type TxRow = {
  auto_key:            string;
  source:              string;
  overridden_auto_key: string | null;
};

/**
 * Build the salary finance upsert batch for a set of staff members.
 *
 * Shared by syncCoachDeductionForSession and restoreCoachSalaryForBranch.
 * All expensive data (suppression states, deduction sums, branch name)
 * must be pre-fetched by the caller — this function is pure computation.
 */
function buildSalaryFinanceBatch(
  staff:            StaffRow[],
  branchId:         string,
  branchName:       string,
  monthKey:         string,
  academyId:        string,
  txByKey:          Map<string, TxRow>,
  deductionByStaff: Map<string, number>,
  now:              string
): Record<string, unknown>[] {
  const batch: Record<string, unknown>[] = [];

  for (const s of staff) {
    const autoKey  = `salary:${monthKey}:${s.id}:${branchId}`;
    const existing = txByKey.get(autoKey);
    if (existing?.source === "suppressed")  continue;
    if (existing?.overridden_auto_key)      continue;

    const branchCount = Math.max(1, (s.branch_ids ?? []).length);
    const share = Math.round(((Number(s.monthly_salary) || 0) / branchCount) * 100) / 100;
    if (!Number.isFinite(share) || share <= 0) continue;

    const totalDeductions = deductionByStaff.get(s.id) ?? 0;
    const netShare = Math.max(0, Math.round((share - totalDeductions) * 100) / 100);

    const baseNote = `${s.name} — ${s.role}${
      s.role === "موظف" && s.job_title ? ` (${s.job_title})` : ""
    } — ${branchName}`;

    batch.push({
      academy_id: academyId,
      auto_key:   autoKey,
      month:      monthKey,
      date:       `${monthKey}-01`,
      type:       "مصروف",
      branch_id:  branchId,
      category:   "رواتب",
      amount:     netShare,
      note:       totalDeductions > 0 ? `${baseNote} (خصومات: ${totalDeductions} د.ك)` : baseNote,
      source:     "auto",
      updated_at: now,
    });
  }

  return batch;
}

/**
 * Apply a per-session deduction to all active coaches assigned to the branch
 * and immediately update their salary Finance entries.
 *
 * Called from the Calendar when a session is cancelled with the
 * "deduct coach session payment" option selected.
 *
 * Creates a staff_attendance record (status=no_training, deduct_from_salary=true,
 * deduction_amount=computed) for each coach so that:
 *  - The Finance page groupedTxViews shows a sub-item "خصم — لا يوجد تمرين"
 *  - The salary Finance entry (salary:{month}:{staffId}:{branchId}) is reduced
 *    immediately without waiting for the Finance page to re-sync.
 *
 * DB round-trips: 4 (regardless of number of coaches N)
 *  1. Parallel: [SELECT branches, SELECT staff]
 *  2. Batch UPSERT staff_attendance (all N coaches in one call)
 *  3. Parallel: [SELECT finance_tx suppression states, SELECT deduction sums]
 *  4. Batch UPSERT finance_tx (all non-suppressed coaches in one call)
 */
export async function syncCoachDeductionForSession(
  branchId: string,
  date:     string
): Promise<void> {
  const supabase  = createClient();
  const academyId = await resolveAcademyId();
  const monthKey  = date.slice(0, 7);
  const [y, m]    = monthKey.split("-").map(Number);
  const lastDay   = new Date(y, m, 0).getDate();
  const monthEnd  = `${monthKey}-${String(lastDay).padStart(2, "0")}`;
  const now       = new Date().toISOString();

  // ── Round 1: Parallel — fetch branch (days+name) and active staff ─────────
  const [branchResult, staffResult] = await Promise.all([
    supabase
      .from("branches")
      .select("name, days")
      .eq("id", branchId)
      .eq("academy_id", academyId)
      .maybeSingle(),
    supabase
      .from("staff")
      .select("id, name, role, job_title, monthly_salary, branch_ids")
      .eq("academy_id", academyId)
      .eq("is_active", true)
      .contains("branch_ids", [branchId]),
  ]);

  const branchDays = (branchResult.data?.days as string[]) ?? [];
  const branchName = (branchResult.data?.name as string) ?? "—";
  const staff      = ((staffResult.data ?? []) as StaffRow[]);
  if (!staff.length) return;

  // ── Round 2: Batch upsert staff_attendance (one call for all N coaches) ───
  await supabase
    .from("staff_attendance")
    .upsert(
      staff.map((s) => ({
        academy_id:         academyId,
        staff_id:           s.id,
        branch_id:          branchId,
        date,
        status:             "no_training",
        deduct_from_salary: true,
        deduction_amount:   computeSessionDeduction(
          Number(s.monthly_salary) || 0,
          y, m, branchDays,
          Math.max(1, (s.branch_ids ?? []).length)
        ),
        notes:              "حصة ملغاة — خصم راتب الجلسة",
        updated_at:         now,
      })),
      { onConflict: "staff_id,branch_id,date" }
    );

  // ── Round 3: Parallel — fetch suppression states + all deduction sums ─────
  // Deduction sums include the rows just upserted above, which is correct:
  // the net salary must reflect the new deduction immediately.
  const autoKeys = staff.map((s) => `salary:${monthKey}:${s.id}:${branchId}`);

  const [txResult, attResult] = await Promise.all([
    supabase
      .from("finance_tx")
      .select("auto_key, source, overridden_auto_key")
      .eq("academy_id", academyId)
      .in("auto_key", autoKeys),
    supabase
      .from("staff_attendance")
      .select("staff_id, deduction_amount")
      .eq("academy_id", academyId)
      .eq("branch_id", branchId)
      .eq("deduct_from_salary", true)
      .gt("deduction_amount", 0)
      .gte("date", `${monthKey}-01`)
      .lte("date", monthEnd),
  ]);

  const txByKey = new Map<string, TxRow>(
    ((txResult.data ?? []) as TxRow[]).map((t) => [t.auto_key, t])
  );

  const deductionByStaff = new Map<string, number>();
  for (const row of (attResult.data ?? []) as { staff_id: string; deduction_amount: number }[]) {
    deductionByStaff.set(
      row.staff_id,
      (deductionByStaff.get(row.staff_id) ?? 0) + Number(row.deduction_amount)
    );
  }

  // ── Round 4: Batch upsert salary finance entries (one call) ───────────────
  const financeBatch = buildSalaryFinanceBatch(
    staff, branchId, branchName, monthKey, academyId, txByKey, deductionByStaff, now
  );

  if (financeBatch.length > 0) {
    await supabase
      .from("finance_tx")
      .upsert(financeBatch, { onConflict: "academy_id,auto_key" });
  }
}

/**
 * Remove session-cancellation attendance records (no_training) for a branch+date
 * and restore each affected coach's salary Finance entry to the full amount.
 *
 * Called automatically when a cancelled session is restored to active
 * (via deleteSessionByBranchDate / deleteSession).
 *
 * DB round-trips: 4 (regardless of number of coaches N)
 *  1. SELECT staff_attendance — find no_training records for this branch+date
 *  2. Parallel: [SELECT staff, SELECT branches, SELECT finance_tx suppression,
 *                DELETE staff_attendance (batch)]
 *  3. SELECT staff_attendance deduction sums (after deletion — reflects restored state)
 *  4. Batch UPSERT finance_tx (all non-suppressed coaches in one call)
 */
async function restoreCoachSalaryForBranch(
  branchId:  string,
  date:      string,
  academyId: string
): Promise<void> {
  const supabase = createClient();
  const monthKey = date.slice(0, 7);
  const [y, m]   = monthKey.split("-").map(Number);
  const lastDay  = new Date(y, m, 0).getDate();
  const monthEnd = `${monthKey}-${String(lastDay).padStart(2, "0")}`;
  const now      = new Date().toISOString();

  // ── Round 1: Find all no_training records for this branch+date ────────────
  const { data: attRows } = await supabase
    .from("staff_attendance")
    .select("staff_id")
    .eq("academy_id", academyId)
    .eq("branch_id", branchId)
    .eq("date", date)
    .eq("status", "no_training");

  if (!attRows?.length) return;

  const staffIds = [...new Set((attRows as { staff_id: string }[]).map((r) => r.staff_id))];
  const autoKeys = staffIds.map((sid) => `salary:${monthKey}:${sid}:${branchId}`);

  // ── Round 2: Parallel — fetch staff details, branch name, suppression
  //            states, AND batch-delete all no_training records ─────────────
  const [staffResult, branchResult, txResult] = await Promise.all([
    supabase
      .from("staff")
      .select("id, name, role, job_title, monthly_salary, branch_ids")
      .eq("academy_id", academyId)
      .in("id", staffIds),
    supabase
      .from("branches")
      .select("name")
      .eq("id", branchId)
      .maybeSingle(),
    supabase
      .from("finance_tx")
      .select("auto_key, source, overridden_auto_key")
      .eq("academy_id", academyId)
      .in("auto_key", autoKeys),
    // Batch DELETE — all no_training records for this branch+date in one call.
    // Runs in parallel with the SELECTs above (result is not needed).
    // Round 3 (deduction sums) runs AFTER Promise.all resolves, guaranteeing
    // the deleted rows are gone before we re-sum.
    supabase
      .from("staff_attendance")
      .delete()
      .eq("academy_id", academyId)
      .eq("branch_id", branchId)
      .eq("date", date)
      .eq("status", "no_training"),
  ]);

  const staff = ((staffResult.data ?? []) as StaffRow[]);
  if (!staff.length) return;

  const branchName = (branchResult.data?.name as string) ?? "—";

  const txByKey = new Map<string, TxRow>(
    ((txResult.data ?? []) as TxRow[]).map((t) => [t.auto_key, t])
  );

  // ── Round 3: Fetch remaining deductions — no_training rows already deleted ─
  // This correctly reflects the restored state (no cancelled-session deductions).
  const { data: attDeductions } = await supabase
    .from("staff_attendance")
    .select("staff_id, deduction_amount")
    .eq("academy_id", academyId)
    .eq("branch_id", branchId)
    .eq("deduct_from_salary", true)
    .gt("deduction_amount", 0)
    .gte("date", `${monthKey}-01`)
    .lte("date", monthEnd);

  const deductionByStaff = new Map<string, number>();
  for (const row of (attDeductions ?? []) as { staff_id: string; deduction_amount: number }[]) {
    deductionByStaff.set(
      row.staff_id,
      (deductionByStaff.get(row.staff_id) ?? 0) + Number(row.deduction_amount)
    );
  }

  // ── Round 4: Batch upsert salary finance entries (one call) ───────────────
  const financeBatch = buildSalaryFinanceBatch(
    staff, branchId, branchName, monthKey, academyId, txByKey, deductionByStaff, now
  );

  if (financeBatch.length > 0) {
    await supabase
      .from("finance_tx")
      .upsert(financeBatch, { onConflict: "academy_id,auto_key" });
  }
}

// ── Orchestrated cancel / restore ─────────────────────────────────────────────

export type CancelSessionOptions = {
  branchId:      string;
  date:          string;        // ISO YYYY-MM-DD
  fieldCost:     number;        // 0 = field cost waived, >0 = kept as expense
  deductCoach:   boolean;       // create no_training salary deductions for staff
  extendPlayers: boolean;       // compensate active players with +1 session
  branchDays:    string[];      // branch.days[] for session-days calculation
  note:          string | null;
};

export type SessionOrchestrationResult = {
  ok:                  boolean;
  error?:              string;
  /** IDs of players who received session compensation during a cancel operation.
   *  Store this in calendar_events.compensated_player_ids so the restore flow
   *  can reverse exactly these players without re-deriving eligibility. */
  compensatedPlayerIds: string[];
};

/**
 * Runs all side-effects of cancelling a training session in a guaranteed,
 * ordered sequence. If any step fails, previously committed DB changes are
 * rolled back so the system cannot end up in a partially-updated state.
 *
 * Execution order:
 *  1. Upsert session record (triggers finance field-cost sync internally)
 *  2. [optional] Coach salary deduction → staff_attendance + finance entries
 *  3. [optional] Player session compensation → players.sessions / end_date
 *
 * Rollback guarantees:
 *  - Step 2 fails → deleteSessionByBranchDate() reverses step 1
 *    (suppresses finance entry, removes session record)
 *  - Step 3 fails → deleteSessionByBranchDate() reverses steps 1 + 2
 *    (also calls restoreCoachSalaryForBranch which removes no_training
 *    records and restores salary finance entries)
 *
 * The calendar event (calendar_events table) is managed by the caller
 * and should be created AFTER this function returns { ok: true }.
 */
export async function orchestrateCancelSession(
  opts: CancelSessionOptions
): Promise<SessionOrchestrationResult> {

  // ── Step 1: Session record + finance sync ────────────────────────────────
  try {
    await upsertSession({
      branch_id:  opts.branchId,
      date:       opts.date,
      status:     "cancelled",
      field_cost: opts.fieldCost,
      coach_cost: 0,
      revenue:    0,
      notes:      opts.note,
    });
  } catch (e) {
    return {
      ok:                  false,
      error:               `فشل تسجيل إلغاء الجلسة: ${e instanceof Error ? e.message : String(e)}`,
      compensatedPlayerIds: [],
    };
  }

  // ── Step 2: Coach salary deduction ──────────────────────────────────────
  if (opts.deductCoach) {
    try {
      await syncCoachDeductionForSession(opts.branchId, opts.date);
    } catch (e) {
      // Roll back step 1 (session record + finance)
      await deleteSessionByBranchDate(opts.branchId, opts.date).catch((re) =>
        console.error("[sessions] orchestrateCancelSession: rollback step 1 failed:", re)
      );
      return {
        ok:                  false,
        error:               `فشل خصم راتب الجلسة: ${e instanceof Error ? e.message : String(e)}`,
        compensatedPlayerIds: [],
      };
    }
  }

  // ── Step 3: Player session compensation ──────────────────────────────────
  let compensatedPlayerIds: string[] = [];
  if (opts.extendPlayers) {
    try {
      // extendBranchPlayersByOneSession returns the exact IDs of compensated players.
      // These are stored in the calendar event so the restore flow can reverse
      // exactly those players without re-deriving eligibility from current state.
      compensatedPlayerIds = await extendBranchPlayersByOneSession(opts.branchId, opts.branchDays, opts.date);
    } catch (e) {
      // Roll back steps 1 + 2:
      // deleteSessionByBranchDate internally calls restoreCoachSalaryForBranch
      // which removes the no_training records created in step 2 and restores
      // salary finance entries to their pre-deduction amounts.
      await deleteSessionByBranchDate(opts.branchId, opts.date).catch((re) =>
        console.error("[sessions] orchestrateCancelSession: rollback steps 1+2 failed:", re)
      );
      return {
        ok:                  false,
        error:               `فشل تعويض اللاعبين: ${e instanceof Error ? e.message : String(e)}`,
        compensatedPlayerIds: [],
      };
    }
  }

  return { ok: true, compensatedPlayerIds };
}

/**
 * Runs all side-effects of restoring a previously-cancelled training session
 * in a guaranteed, ordered sequence.
 *
 * Execution order:
 *  1. deleteSessionByBranchDate → removes session record, restores finance
 *     field-cost entry, removes no_training staff attendance records, and
 *     restores salary finance entries to full amounts.
 *  2. Reverse player session compensation for exactly the players stored in
 *     compensatedPlayerIds (read from calendar_events.compensated_player_ids).
 *     This uses the canonical record from cancel time rather than re-deriving
 *     eligibility from current player state, which avoids incorrect reversals
 *     when a player's subscription changed between cancel and restore.
 *
 * The calendar event (calendar_events table) is managed by the caller
 * and should be deleted AFTER this function returns { ok: true } to ensure
 * the UI only reflects the restored state once all DB changes are committed.
 *
 * @param compensatedPlayerIds  Array of player IDs from calendar_events.compensated_player_ids.
 *                              Pass [] for sessions cancelled before migration 30 (no reversal
 *                              attempted — safe fallback, avoids incorrect state changes).
 */
export async function orchestrateRestoreSession(
  branchId:             string,
  date:                 string,
  compensatedPlayerIds: string[],
  branchDays:           string[]
): Promise<SessionOrchestrationResult> {

  // ── Step 1: Remove session record + restore finance + restore coach salary ─
  try {
    await deleteSessionByBranchDate(branchId, date);
  } catch (e) {
    return {
      ok:                  false,
      error:               `فشل استعادة الجلسة: ${e instanceof Error ? e.message : String(e)}`,
      compensatedPlayerIds: [],
    };
  }

  // ── Step 2: Reverse player compensation for the exact compensated set ────
  if (compensatedPlayerIds.length > 0) {
    try {
      await reduceSpecificPlayersByOneSession(compensatedPlayerIds, branchDays);
    } catch (e) {
      // Step 1 is already committed and cannot be reversed here.
      // The session is restored (finance is correct), but player sessions
      // were not reversed. Report so the caller can notify the user.
      return {
        ok:                  false,
        error:               `تمت استعادة الجلسة والمالية بنجاح، لكن فشل عكس تعويض اللاعبين: ${e instanceof Error ? e.message : String(e)}`,
        compensatedPlayerIds: [],
      };
    }
  }

  return { ok: true, compensatedPlayerIds: [] };
}
