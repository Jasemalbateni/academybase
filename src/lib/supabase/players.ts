import { createClient } from "./browser";
import { resolveAcademyId } from "./academyId";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DbPlayer = {
  id: string;
  academy_id: string;
  branch_id: string | null;
  name: string;
  birth: string;
  phone: string;
  subscription_mode: string;
  sessions: number;
  price: number;
  start_date: string;   // ISO YYYY-MM-DD
  end_date: string | null; // ISO YYYY-MM-DD
  is_legacy: boolean;
  is_paused: boolean;   // Feature C: subscription paused
  created_at: string;
  updated_at: string;
};

export type PlayerInsert = {
  branch_id: string | null;
  name: string;
  birth: string;
  phone: string;
  subscription_mode: string;
  sessions: number;
  price: number;
  start_date: string;
  end_date: string | null;
  is_legacy: boolean;
};

export type PlayerUpdate = Partial<PlayerInsert> & { is_paused?: boolean };

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function listPlayers(): Promise<DbPlayer[]> {
  const supabase = createClient();
  const academyId = await resolveAcademyId();

  const { data, error } = await supabase
    .from("players")
    .select("*")
    .eq("academy_id", academyId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`${error.message} [${error.code}]`);
  return (data ?? []) as DbPlayer[];
}

export async function createPlayer(payload: PlayerInsert): Promise<DbPlayer> {
  const supabase = createClient();
  const academyId = await resolveAcademyId();

  const { data, error } = await supabase
    .from("players")
    .insert({ ...payload, academy_id: academyId })
    .select()
    .single();

  if (error) throw new Error(`${error.message} [${error.code}]`);
  return data as DbPlayer;
}

export async function updatePlayer(
  id: string,
  payload: PlayerUpdate
): Promise<DbPlayer> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("players")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(`${error.message} [${error.code}]`);
  return data as DbPlayer;
}

export async function deletePlayer(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("players").delete().eq("id", id);
  if (error) throw new Error(`${error.message} [${error.code}]`);
}

// ── Feature B: Extend ─────────────────────────────────────────────────────────

/** Adds `days` to the player's current end_date and saves. */
export async function extendPlayer(id: string, days: number): Promise<DbPlayer> {
  const supabase = createClient();
  const { data: p } = await supabase
    .from("players")
    .select("end_date")
    .eq("id", id)
    .single();

  const base = p?.end_date
    ? (() => {
        const [y, m, d] = (p.end_date as string).split("-").map(Number);
        return new Date(y, m - 1, d);
      })()
    : new Date();

  base.setDate(base.getDate() + days);
  const newEnd = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`;
  return updatePlayer(id, { end_date: newEnd });
}

// ── Feature C: Pause / Resume ────────────────────────────────────────────────

export async function pausePlayer(id: string): Promise<DbPlayer> {
  return updatePlayer(id, { is_paused: true });
}

export async function resumePlayer(id: string): Promise<DbPlayer> {
  return updatePlayer(id, { is_paused: false });
}
