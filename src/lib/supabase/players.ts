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

export type PlayerUpdate = Partial<PlayerInsert>;

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
