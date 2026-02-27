import { createClient } from "./browser";
import { resolveAcademyId } from "./academyId";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DbPayment = {
  id: string;
  academy_id: string;
  branch_id: string | null;
  player_id: string;
  amount: number;
  kind: "new" | "renew" | "legacy";
  note: string | null;
  date: string;                     // ISO YYYY-MM-DD — subscription start
  subscription_end: string | null;  // ISO YYYY-MM-DD — last day of period (null = legacy row)
  created_at: string;
};

export type PaymentInsert = {
  branch_id: string | null;
  player_id: string;
  amount: number;
  kind: "new" | "renew" | "legacy";
  note?: string | null;
  date: string;
  subscription_end?: string | null; // store the period end for full history
};

/**
 * One subscription period extracted from a payment row.
 * Used by the attendance page to determine active windows per player.
 */
export type PaymentPeriod = {
  player_id: string;
  start: string;        // ISO YYYY-MM-DD (payment.date)
  end: string | null;   // ISO YYYY-MM-DD (payment.subscription_end) — null for legacy rows
};

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function listPayments(): Promise<DbPayment[]> {
  const supabase = createClient();
  const academyId = await resolveAcademyId();

  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("academy_id", academyId)
    .order("date", { ascending: false });

  if (error) throw new Error(`${error.message} [${error.code}]`);
  return (data ?? []) as DbPayment[];
}

/**
 * Returns all subscription periods for every player in this academy, sorted
 * by date ascending. Each payment = one period with a start date and,
 * for rows written after migration 16, an explicit end date.
 *
 * The attendance page uses this to evaluate whether any session date falls
 * within an active subscription window (checking ALL periods, not just the
 * current one stored on the player record).
 */
export async function listPaymentPeriods(): Promise<PaymentPeriod[]> {
  const supabase = createClient();
  const academyId = await resolveAcademyId();

  const { data, error } = await supabase
    .from("payments")
    .select("player_id, date, subscription_end")
    .eq("academy_id", academyId)
    .order("date", { ascending: true });

  if (error) throw new Error(`${error.message} [${error.code}]`);

  return (data ?? []).map((row: { player_id: string; date: string; subscription_end: unknown }) => ({
    player_id: row.player_id,
    start:     row.date,
    end:       (row.subscription_end as string | null) ?? null,
  }));
}

export async function createPayment(payload: PaymentInsert): Promise<DbPayment> {
  const supabase = createClient();
  const academyId = await resolveAcademyId();

  const { data, error } = await supabase
    .from("payments")
    .insert({ ...payload, academy_id: academyId })
    .select()
    .single();

  if (error) throw new Error(`${error.message} [${error.code}]`);
  return data as DbPayment;
}
