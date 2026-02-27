import { createClient } from "./browser";
import { resolveAcademyId } from "./academyId";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DbBranch = {
  id: string;
  academy_id: string;
  name: string;
  price: number;
  days: string[];
  start_time: string | null;
  end_time: string | null;
  subscription_mode: string;
  rent_type: string;       // 'fixed_monthly' | 'per_session' (migration 20)
  monthly_rent: number;    // Monthly field rental cost (migration 20)
  created_at: string;
};

export type BranchInsert = {
  name: string;
  price: number;
  days: string[];
  start_time: string | null;
  end_time: string | null;
  subscription_mode: string;
  rent_type?: string;
  monthly_rent?: number;
};

export type BranchUpdate = Partial<BranchInsert>;

// ── CRUD ──────────────────────────────────────────────────────────────────────
// All functions use the shared resolveAcademyId() from academyId.ts.
// That function throws a diagnostic error message when resolution fails,
// which surfaces the real reason (RLS blocked, no row, not authed, etc.).

export async function listBranches(): Promise<DbBranch[]> {
  const supabase = createClient();
  const academyId = await resolveAcademyId();

  const { data, error } = await supabase
    .from("branches")
    .select("*")
    .eq("academy_id", academyId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`${error.message} [${error.code}]`);
  return (data ?? []) as DbBranch[];
}

export async function createBranch(payload: BranchInsert): Promise<DbBranch> {
  const supabase = createClient();
  const academyId = await resolveAcademyId();

  const { data, error } = await supabase
    .from("branches")
    .insert({ ...payload, academy_id: academyId })
    .select()
    .single();

  if (error) throw new Error(`${error.message} [${error.code}]`);
  return data as DbBranch;
}

export async function updateBranch(
  id: string,
  payload: BranchUpdate
): Promise<DbBranch> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("branches")
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(`${error.message} [${error.code}]`);
  return data as DbBranch;
}

export async function deleteBranch(id: string): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase.from("branches").delete().eq("id", id);

  if (error) throw new Error(`${error.message} [${error.code}]`);
}
