import { createClient } from "./browser";
import { resolveAcademyId } from "./academyId";
import { createSubscriptionEvent } from "./subscription-events";

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
  avatar_url: string | null; // Supabase Storage public URL
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
  avatar_url?: string | null;
};

export type PlayerUpdate = Partial<PlayerInsert> & { is_paused?: boolean; avatar_url?: string | null };

// ── Subscription activity check ───────────────────────────────────────────────

/**
 * Single source of truth for whether a player's subscription was active
 * on a given session date.
 *
 * Used by ALL modules that need to determine subscription activity for a
 * specific date (compensation, deduction, attendance eligibility):
 *
 * Rules (evaluated in order):
 *  1. Paused players are never active — their subscription is frozen.
 *  2. The session date must be on or after the player's start_date.
 *  3. The session date must be on or before the player's end_date
 *     (null end_date = unlimited subscription, always passes this rule).
 *  4. For "حصص" (session-count) mode: the player must have sessions > 0.
 *     A player who used all their sessions is not active even if the
 *     contract end_date has not yet passed.
 *  5. For date-based (monthly) mode: rules 1-3 are sufficient.
 *
 * NOTE: For historical attendance accuracy across multiple past renewals,
 * use `buildPeriodsMap` in the attendance page which checks the full
 * payment period history. This function is authoritative for live
 * operations on current or upcoming dates (compensation, deductions).
 */
export function isPlayerActiveOnDate(
  player: Pick<DbPlayer, "is_paused" | "subscription_mode" | "sessions" | "start_date" | "end_date">,
  sessionDate: string   // ISO YYYY-MM-DD
): boolean {
  // Rule 1: Paused subscriptions are never active
  if (player.is_paused) return false;

  // Rule 2: Subscription must have started by the session date
  if (player.start_date && player.start_date > sessionDate) return false;

  // Rule 3: Subscription must not have expired before the session date
  if (player.end_date && player.end_date < sessionDate) return false;

  // Rule 4: Session-count mode — must have at least one session remaining
  if (player.subscription_mode === "حصص") {
    return (player.sessions ?? 0) > 0;
  }

  // Rule 5: Date-based mode — window check already passed above
  return true;
}

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

// ── Avatar upload / delete ─────────────────────────────────────────────────────

/**
 * Upload a player avatar image to the `player-avatars` Supabase Storage bucket.
 * Returns the public URL to store in players.avatar_url.
 *
 * Bucket must exist and have a public access policy (created in Supabase Dashboard).
 * Path: `{academyId}/{playerId}.{ext}` — overwrites previous image for this player.
 */
export async function uploadPlayerAvatar(
  file: File,
  academyId: string,
  playerId: string
): Promise<string> {
  const supabase = createClient();
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${academyId}/${playerId}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from("player-avatars")
    .upload(path, file, { upsert: true, contentType: file.type });

  if (upErr) throw new Error(`فشل رفع الصورة: ${upErr.message}`);

  const { data } = supabase.storage.from("player-avatars").getPublicUrl(path);
  // Append cache-busting timestamp so the browser loads the new image immediately
  return `${data.publicUrl}?t=${Date.now()}`;
}

/**
 * Delete a player's avatar from Supabase Storage.
 * Silently ignores missing-file errors (idempotent).
 */
export async function deletePlayerAvatar(avatarUrl: string): Promise<void> {
  const supabase = createClient();
  // Extract path after "/player-avatars/"
  const match = avatarUrl.match(/player-avatars\/([^?]+)/);
  if (!match) return;
  const path = match[1];
  await supabase.storage.from("player-avatars").remove([path]);
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

// ── Session cancellation compensation ─────────────────────────────────────────

/**
 * Apply one extra session of compensation to all eligible players in a branch
 * when a training session is cancelled.
 *
 * Eligibility is determined by `isPlayerActiveOnDate` at the moment of
 * cancellation. The list of compensated player IDs is RETURNED so that it
 * can be stored in the calendar_events record — the restore flow uses this
 * stored list to reverse exactly the same players without re-deriving
 * eligibility from current (potentially changed) state.
 *
 * Rules:
 * - "حصص" mode: sessions += 1 (only if sessions > 0 on the cancelled date)
 * - Monthly mode: end_date += daysPerSession days
 *   NOTE: players with null end_date (unlimited subscription) are skipped —
 *   unlimited subscribers do not lose subscription time from a cancelled
 *   session and should not receive a finite end_date as compensation.
 *
 * @returns Array of player IDs that were successfully compensated.
 * @param sessionDate ISO YYYY-MM-DD of the cancelled session (eligibility anchor)
 */
export async function extendBranchPlayersByOneSession(
  branchId:    string,
  branchDays:  string[],
  sessionDate: string    // ISO YYYY-MM-DD — the cancelled session date
): Promise<string[]> {
  const supabase  = createClient();
  const academyId = await resolveAcademyId();

  const { data: players } = await supabase
    .from("players")
    .select("id, subscription_mode, sessions, end_date, start_date, is_paused")
    .eq("academy_id", academyId)
    .eq("branch_id", branchId)
    .eq("is_paused", false);

  if (!players?.length) return [];

  // Filter to only players whose subscription was active on the session date.
  // Prevents paused, not-yet-started, expired, and session-depleted players
  // from receiving undeserved compensation.
  const eligible = (
    players as Pick<DbPlayer, "id" | "subscription_mode" | "sessions" | "end_date" | "start_date" | "is_paused">[]
  ).filter((p) => isPlayerActiveOnDate(p, sessionDate));

  if (!eligible.length) return [];

  const sessionsPerWeek = Math.max(1, branchDays.length);
  const daysPerSession  = Math.max(1, Math.round(7 / sessionsPerWeek));
  const today = new Date().toISOString().slice(0, 10);
  const now   = new Date().toISOString();

  // Split eligible players by mode upfront
  const hissasEligible  = eligible.filter((p) => p.subscription_mode === "حصص");
  // Monthly: skip unlimited (null end_date) — no expiry to extend
  const monthlyEligible = eligible.filter(
    (p) => p.subscription_mode !== "حصص" && p.end_date !== null
  );

  // ── Batch update "حصص" players (sessions + 1) ─────────────────────────────
  // We already have sessions from the initial SELECT — compute new value
  // client-side and upsert in one round-trip instead of N individual UPDATEs.
  if (hissasEligible.length > 0) {
    await supabase.from("players").upsert(
      hissasEligible.map((p) => ({
        id:         p.id,
        sessions:   (p.sessions ?? 0) + 1,
        updated_at: now,
      })),
      { onConflict: "id" }
    );
  }

  // ── Batch update monthly players (end_date + daysPerSession) ──────────────
  // We already have end_date from the initial SELECT — no extra SELECT needed.
  // Previously extendPlayer() did a redundant SELECT per player.
  if (monthlyEligible.length > 0) {
    await supabase.from("players").upsert(
      monthlyEligible.map((p) => {
        const base = new Date((p.end_date as string) + "T00:00:00");
        base.setDate(base.getDate() + daysPerSession);
        return {
          id:         p.id,
          end_date:   `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`,
          updated_at: now,
        };
      }),
      { onConflict: "id" }
    );
  }

  // Collect compensated IDs from both modes
  const compensatedIds: string[] = [
    ...hissasEligible.map((p) => p.id),
    ...monthlyEligible.map((p) => p.id),
  ];

  // Fire-and-forget subscription events (non-critical)
  compensatedIds.forEach((pid) => {
    createSubscriptionEvent({
      player_id:   pid,
      event_type:  "extension",
      event_date:  today,
      extend_days: 1,
      note:        "تعويض عن حصة ملغاة",
    }).catch(() => {/* non-critical */});
  });

  return compensatedIds;
}

/**
 * Reverse the compensation given to a specific set of players when a training
 * was cancelled. Called when the cancellation is restored.
 *
 * Takes the exact player IDs that were compensated at cancel time (stored in
 * calendar_events.compensated_player_ids) instead of re-deriving eligibility
 * from current player state, which can differ from cancel-time state.
 *
 * Safety guards:
 * - "حصص" mode: sessions = max(0, sessions - 1)  — never goes negative
 * - Monthly mode: end_date -= daysPerSession       — floors at start_date
 * - Monthly mode with null end_date: skipped       — was not compensated (see extend)
 *
 * @param playerIds  Exact IDs returned by extendBranchPlayersByOneSession
 * @param branchDays Branch schedule days — must match what was used during cancel
 */
export async function reduceSpecificPlayersByOneSession(
  playerIds:  string[],
  branchDays: string[]
): Promise<void> {
  if (!playerIds.length) return;

  const supabase  = createClient();
  const academyId = await resolveAcademyId();

  // Fetch the exact players by ID — no eligibility filter needed here since
  // we already know which players were compensated at cancel time.
  const { data: players } = await supabase
    .from("players")
    .select("id, subscription_mode, sessions, end_date, start_date")
    .eq("academy_id", academyId)
    .in("id", playerIds);

  if (!players?.length) return;

  const sessionsPerWeek = Math.max(1, branchDays.length);
  const daysPerSession  = Math.max(1, Math.round(7 / sessionsPerWeek));
  const today = new Date().toISOString().slice(0, 10);
  const now   = new Date().toISOString();

  const typedPlayers = players as Pick<DbPlayer, "id" | "subscription_mode" | "sessions" | "end_date" | "start_date">[];

  // ── Batch "حصص" reversal (sessions - 1, floor 0) ─────────────────────────
  const hissasBatch = typedPlayers
    .filter((p) => p.subscription_mode === "حصص")
    .map((p) => ({
      id:         p.id,
      sessions:   Math.max(0, (p.sessions ?? 0) - 1),
      updated_at: now,
    }));

  // ── Batch monthly reversal (end_date - daysPerSession, floor start_date) ──
  const monthlyBatch: { id: string; end_date: string; updated_at: string }[] = [];
  for (const p of typedPlayers.filter((p) => p.subscription_mode !== "حصص" && p.end_date)) {
    const endDate   = new Date((p.end_date as string) + "T00:00:00");
    const startDate = p.start_date ? new Date(p.start_date + "T00:00:00") : endDate;
    endDate.setDate(endDate.getDate() - daysPerSession);
    if (endDate < startDate) {
      console.error(`[players] reduceSpecificPlayersByOneSession: endDate would go below start_date for player ${p.id} — skipping`);
      continue;
    }
    monthlyBatch.push({
      id:         p.id,
      end_date:   `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`,
      updated_at: now,
    });
  }

  // Single upsert per mode instead of N individual UPDATEs
  if (hissasBatch.length > 0) {
    await supabase.from("players").upsert(hissasBatch, { onConflict: "id" });
  }
  if (monthlyBatch.length > 0) {
    await supabase.from("players").upsert(monthlyBatch, { onConflict: "id" });
  }

  // Fire-and-forget subscription events (non-critical)
  const updatedIds = [...hissasBatch.map((p) => p.id), ...monthlyBatch.map((p) => p.id)];
  updatedIds.forEach((pid) => {
    createSubscriptionEvent({
      player_id:   pid,
      event_type:  "extension",
      event_date:  today,
      extend_days: -1,
      note:        "عكس تمديد بعد استعادة الجلسة",
    }).catch(() => {/* non-critical */});
  });
}
