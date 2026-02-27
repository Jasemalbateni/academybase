import { createClient } from "./browser";
import { resolveAcademyId } from "./academyId";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DbStaff = {
  id: string;
  academy_id: string;
  name: string;
  role: string;
  job_title: string | null;
  monthly_salary: number;
  branch_ids: string[];
  assign_mode: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type StaffInsert = {
  name: string;
  role: string;
  job_title: string | null;
  monthly_salary: number;
  branch_ids: string[];
  assign_mode: string;
  is_active: boolean;
};

export type StaffUpdate = Partial<StaffInsert>;

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function listStaff(): Promise<DbStaff[]> {
  const supabase = createClient();
  const academyId = await resolveAcademyId();

  const { data, error } = await supabase
    .from("staff")
    .select("*")
    .eq("academy_id", academyId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as DbStaff[];
}

export async function createStaffMember(payload: StaffInsert): Promise<DbStaff> {
  const supabase = createClient();
  const academyId = await resolveAcademyId();

  const { data, error } = await supabase
    .from("staff")
    .insert({ ...payload, academy_id: academyId })
    .select()
    .single();

  if (error) throw error;
  return data as DbStaff;
}

export async function updateStaffMember(
  id: string,
  payload: StaffUpdate
): Promise<DbStaff> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("staff")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as DbStaff;
}

export async function deleteStaffMember(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("staff").delete().eq("id", id);
  if (error) throw error;
}
