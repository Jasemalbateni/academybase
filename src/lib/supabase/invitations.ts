import { createClient } from "./browser";
import { resolveAcademyId } from "./academyId";

// ── Types ──────────────────────────────────────────────────────────────────────

export type DbInvitation = {
  id: string;
  academy_id: string;
  email: string;
  role: "partner" | "branch_manager" | "admin_staff";
  token: string;
  invited_by: string;
  branch_ids: string[];
  has_finance_access: boolean;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
};

export type InvitationInsert = {
  email: string;
  role: "partner" | "branch_manager" | "admin_staff";
  branch_ids: string[];
  has_finance_access: boolean;
};

// ── CRUD (browser client) ──────────────────────────────────────────────────────
// Note: These functions are retained for reference but the team management page
// uses server actions (app/invite/actions.ts) so that tokens never appear in
// the browser's REST API network tab.

/** List all pending (not accepted) invitations for the current user's academy. */
export async function listInvitations(): Promise<DbInvitation[]> {
  const supabase = createClient();
  const academyId = await resolveAcademyId();

  const { data, error } = await supabase
    .from("invitations")
    .select("*")
    .eq("academy_id", academyId)
    .is("accepted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as DbInvitation[];
}

/** Create an invitation (owner/partner only — enforced by RLS). */
export async function createInvitation(
  payload: InvitationInsert
): Promise<DbInvitation> {
  const supabase = createClient();
  const academyId = await resolveAcademyId();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("المستخدم غير مسجل الدخول");

  const { data, error } = await supabase
    .from("invitations")
    .insert({
      academy_id:         academyId,
      email:              payload.email.trim().toLowerCase(),
      role:               payload.role,
      branch_ids:         payload.branch_ids,
      has_finance_access: payload.has_finance_access,
      invited_by:         user.id,
    })
    .select()
    .single();

  if (error) throw error;
  return data as DbInvitation;
}

/** Revoke a pending invitation (owner/partner only — enforced by RLS). */
export async function deleteInvitation(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("invitations").delete().eq("id", id);
  if (error) throw error;
}
