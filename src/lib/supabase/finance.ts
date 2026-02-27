import { createClient } from "./browser";
import { resolveAcademyId } from "./academyId";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DbFinanceTx = {
  id: string;
  academy_id: string;
  month: string;             // YYYY-MM
  date: string;              // ISO YYYY-MM-DD
  type: string;              // 'مصروف' | 'إيراد'
  branch_id: string;         // UUID string or 'all'
  category: string;
  amount: number;
  note: string | null;
  source: string;            // 'auto' | 'manual'
  auto_key: string | null;
  overridden_auto_key: string | null;
  created_at: string;
  updated_at: string | null;
};

export type FinanceTxInsert = {
  month: string;
  date: string;
  type: string;
  branch_id: string;
  category: string;
  amount: number;
  note?: string | null;
  source: string;
  auto_key?: string | null;
  overridden_auto_key?: string | null;
};

export type FinanceTxUpdate = Partial<FinanceTxInsert>;

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function listFinanceTx(): Promise<DbFinanceTx[]> {
  const supabase = createClient();
  const academyId = await resolveAcademyId();

  const { data, error } = await supabase
    .from("finance_tx")
    .select("*")
    .eq("academy_id", academyId)
    .order("date", { ascending: false });

  if (error) throw new Error(`${error.message} [${error.code}]`);
  return (data ?? []) as DbFinanceTx[];
}

export async function createFinanceTx(
  payload: FinanceTxInsert
): Promise<DbFinanceTx> {
  const supabase = createClient();
  const academyId = await resolveAcademyId();

  const { data, error } = await supabase
    .from("finance_tx")
    .insert({ ...payload, academy_id: academyId })
    .select()
    .single();

  if (error) throw new Error(`${error.message} [${error.code}]`);
  return data as DbFinanceTx;
}

/**
 * Upsert an auto-generated transaction by auto_key.
 * Uses the unique index on (academy_id, auto_key) for conflict resolution.
 */
export async function upsertAutoFinanceTx(
  payload: FinanceTxInsert & { auto_key: string }
): Promise<DbFinanceTx> {
  const supabase = createClient();
  const academyId = await resolveAcademyId();

  const { data, error } = await supabase
    .from("finance_tx")
    .upsert(
      { ...payload, academy_id: academyId, updated_at: new Date().toISOString() },
      { onConflict: "academy_id,auto_key" }
    )
    .select()
    .single();

  if (error) throw new Error(`${error.message} [${error.code}]`);
  return data as DbFinanceTx;
}

export async function updateFinanceTx(
  id: string,
  payload: FinanceTxUpdate
): Promise<DbFinanceTx> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("finance_tx")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(`${error.message} [${error.code}]`);
  return data as DbFinanceTx;
}

export async function deleteFinanceTx(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("finance_tx").delete().eq("id", id);
  if (error) throw new Error(`${error.message} [${error.code}]`);
}
