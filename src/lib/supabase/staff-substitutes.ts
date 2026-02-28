import { createClient } from "./browser";
import { resolveAcademyId } from "./academyId";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DbStaffSubstitute = {
  id: string;
  academy_id: string;
  staff_id: string;
  branch_id: string;
  date: string;                   // ISO YYYY-MM-DD
  substitute_staff_id: string | null;
  substitute_name: string;
  payment_amount: number;
  note: string | null;
  finance_tx_id: string | null;
  created_at: string;
};

export type StaffSubstituteInsert = {
  staff_id: string;
  branch_id: string;
  date: string;
  substitute_staff_id?: string | null;
  substitute_name: string;
  payment_amount: number;
  note?: string | null;
};

// ── CRUD ──────────────────────────────────────────────────────────────────────

/**
 * Upsert a substitute assignment.
 * UNIQUE conflict: (staff_id, branch_id, date)
 */
export async function upsertStaffSubstitute(
  payload: StaffSubstituteInsert
): Promise<DbStaffSubstitute> {
  const supabase  = createClient();
  const academyId = await resolveAcademyId();

  const { data, error } = await supabase
    .from("staff_substitutes")
    .upsert(
      { ...payload, academy_id: academyId },
      { onConflict: "staff_id,branch_id,date" }
    )
    .select()
    .single();

  if (error) throw new Error(`${error.message} [${error.code}]`);
  return data as DbStaffSubstitute;
}

/**
 * Returns all substitutes for a given date.
 * Returns [] silently if the migration hasn't been applied yet.
 */
export async function listStaffSubstitutes(
  date: string
): Promise<DbStaffSubstitute[]> {
  const supabase  = createClient();
  const academyId = await resolveAcademyId();

  const { data, error } = await supabase
    .from("staff_substitutes")
    .select("*")
    .eq("academy_id", academyId)
    .eq("date", date);

  if (error) {
    if (
      error.code === "PGRST205" ||
      error.code === "42P01" ||
      (error.message && error.message.includes("staff_substitutes"))
    ) {
      return [];
    }
    throw new Error(`${error.message} [${error.code}]`);
  }

  return (data ?? []) as DbStaffSubstitute[];
}

export async function deleteStaffSubstitute(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("staff_substitutes").delete().eq("id", id);
  if (error) throw new Error(`${error.message} [${error.code}]`);
}
