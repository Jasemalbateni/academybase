import { createClient } from "./browser";
import { resolveAcademyId } from "./academyId";
import type { Insight } from "@/src/lib/insights";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DbNotification = {
  id: string;
  academy_id: string;
  insight_id: string;
  title: string;
  description: string | null;
  severity: "critical" | "warning" | "info";
  scope_type: string;
  scope_id: string | null;
  scope_name: string | null;
  is_read: boolean;
  created_at: string;
};

// ── Sync ──────────────────────────────────────────────────────────────────────

/**
 * Upsert critical + warning insights as persistent notifications.
 * Uses ignoreDuplicates so existing read/unread state is preserved.
 * Info-level insights are intentionally excluded (too noisy).
 */
export async function upsertNotificationsFromInsights(
  insights: Insight[]
): Promise<void> {
  const important = insights.filter(
    (i) => i.severity === "critical" || i.severity === "warning"
  );
  if (!important.length) return;

  const supabase = createClient();
  let academyId: string;
  try {
    academyId = await resolveAcademyId();
  } catch {
    return; // not set up yet
  }

  const rows = important.map((ins) => ({
    academy_id:  academyId,
    insight_id:  ins.id,
    title:       ins.title,
    description: ins.description,
    severity:    ins.severity,
    scope_type:  ins.scope.type,
    scope_id:
      ins.scope.type === "player"  ? ins.scope.player_id  :
      ins.scope.type === "branch"  ? ins.scope.branch_id  : null,
    scope_name:
      ins.scope.type === "player"  ? ins.scope.player_name  :
      ins.scope.type === "branch"  ? ins.scope.branch_name  : null,
  }));

  await supabase
    .from("notifications")
    .upsert(rows, { onConflict: "academy_id,insight_id", ignoreDuplicates: true });
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function listNotifications(): Promise<DbNotification[]> {
  const supabase = createClient();
  const academyId = await resolveAcademyId();

  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("academy_id", academyId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw new Error(`${error.message} [${error.code}]`);
  return (data ?? []) as DbNotification[];
}

export async function countUnreadNotifications(): Promise<number> {
  const supabase = createClient();
  let academyId: string;
  try {
    academyId = await resolveAcademyId();
  } catch {
    return 0;
  }

  const { count, error } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("academy_id", academyId)
    .eq("is_read", false);

  if (error) return 0;
  return count ?? 0;
}

export async function markNotificationRead(id: string): Promise<void> {
  const supabase = createClient();
  await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", id);
}

export async function markAllNotificationsRead(): Promise<void> {
  const supabase = createClient();
  const academyId = await resolveAcademyId();
  await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("academy_id", academyId)
    .eq("is_read", false);
}
