"use server";

import { createClient } from "../../src/lib/supabase/server";
import { createAdminClient } from "../../src/lib/supabase/admin";
import type { DbInvitation } from "../../src/lib/supabase/invitations";
import type { UserRole } from "../../src/lib/supabase/roles";

// ── Shared types ──────────────────────────────────────────────────────────────

export type MemberInfo = {
  userId: string;
  role: UserRole;
  hasFinanceAccess: boolean;
  fullName: string;
  /** Empty = full academy access (owner/partner). Non-empty = branch-scoped. */
  branchIds: string[];
};

// ── Helper: verify caller is owner/partner of their academy ──────────────────

async function requireOwner(): Promise<
  { userId: string; academyId: string } | { error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) return { error: "يرجى تسجيل الدخول" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("academy_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile?.academy_id) return { error: "لا توجد أكاديمية مرتبطة بهذا الحساب" };

  const { data: member } = await supabase
    .from("academy_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("academy_id", profile.academy_id)
    .maybeSingle();

  if (member?.role !== "owner" && member?.role !== "partner") {
    return { error: "هذه العملية متاحة لمالك الأكاديمية أو الشريك فقط" };
  }

  return { userId: user.id, academyId: profile.academy_id };
}

// ── Invitation management ─────────────────────────────────────────────────────

/**
 * List all pending (not yet accepted) invitations for the owner/partner's academy.
 * Uses admin client so invitation tokens never appear in browser network tab.
 */
export async function listInvitationsAction(): Promise<{
  data?: DbInvitation[];
  error?: string;
}> {
  try {
    const auth = await requireOwner();
    if ("error" in auth) return { error: auth.error };

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("invitations")
      .select("*")
      .eq("academy_id", auth.academyId)
      .is("accepted_at", null)
      .order("created_at", { ascending: false });

    if (error) return { error: error.message };
    return { data: (data ?? []) as DbInvitation[] };
  } catch (e) {
    console.error("[listInvitationsAction]", e);
    return { error: e instanceof Error ? e.message : "خطأ غير متوقع" };
  }
}

/**
 * Create an invitation (owner/partner only).
 * branch_ids and has_finance_access are only meaningful for branch_manager/admin_staff.
 */
export async function createInvitationAction(
  email: string,
  role: "partner" | "branch_manager" | "admin_staff",
  branchIds: string[],
  hasFinanceAccess: boolean
): Promise<{ data?: DbInvitation; error?: string }> {
  try {
    const auth = await requireOwner();
    if ("error" in auth) return { error: auth.error };

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return { error: "يرجى إدخال بريد إلكتروني صحيح" };
    }

    if (role !== "partner" && branchIds.length === 0) {
      return { error: "يجب تحديد فرع واحد على الأقل" };
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("invitations")
      .insert({
        academy_id:         auth.academyId,
        email:              cleanEmail,
        role,
        branch_ids:         role === "partner" ? [] : branchIds,
        has_finance_access: role === "branch_manager" ? hasFinanceAccess : false,
        invited_by:         auth.userId,
      })
      .select()
      .single();

    if (error) return { error: error.message };
    return { data: data as DbInvitation };
  } catch (e) {
    console.error("[createInvitationAction]", e);
    return { error: e instanceof Error ? e.message : "خطأ غير متوقع" };
  }
}

/**
 * Revoke (delete) a pending invitation by ID (owner/partner only).
 * Scoped to the caller's academy to prevent cross-academy deletion.
 */
export async function deleteInvitationAction(
  id: string
): Promise<{ error?: string }> {
  try {
    const auth = await requireOwner();
    if ("error" in auth) return { error: auth.error };

    const admin = createAdminClient();
    const { error } = await admin
      .from("invitations")
      .delete()
      .eq("id", id)
      .eq("academy_id", auth.academyId);

    if (error) return { error: error.message };
    return {};
  } catch (e) {
    console.error("[deleteInvitationAction]", e);
    return { error: e instanceof Error ? e.message : "خطأ غير متوقع" };
  }
}

// ── Member management ─────────────────────────────────────────────────────────

/**
 * List all members of the academy with their profile names and branch assignments.
 */
export async function listMembersAction(): Promise<{
  data?: MemberInfo[];
  error?: string;
}> {
  try {
    const auth = await requireOwner();
    if ("error" in auth) return { error: auth.error };

    const admin = createAdminClient();

    const [membersRes, profilesRes, branchAccessRes] = await Promise.all([
      admin
        .from("academy_members")
        .select("user_id, role, has_finance_access")
        .eq("academy_id", auth.academyId),
      admin
        .from("profiles")
        .select("user_id, full_name")
        .eq("academy_id", auth.academyId),
      admin
        .from("member_branch_access")
        .select("user_id, branch_id")
        .eq("academy_id", auth.academyId),
    ]);

    if (membersRes.error) return { error: membersRes.error.message };

    const nameMap = new Map(
      (profilesRes.data ?? []).map((p) => [p.user_id, p.full_name ?? "—"])
    );

    // Group branch IDs per user
    const branchMap = new Map<string, string[]>();
    for (const row of branchAccessRes.data ?? []) {
      const existing = branchMap.get(row.user_id) ?? [];
      existing.push(row.branch_id as string);
      branchMap.set(row.user_id, existing);
    }

    const members: MemberInfo[] = (membersRes.data ?? []).map((m) => ({
      userId:           m.user_id,
      role:             m.role as UserRole,
      hasFinanceAccess: m.has_finance_access ?? false,
      fullName:         nameMap.get(m.user_id) ?? "—",
      branchIds:        branchMap.get(m.user_id) ?? [],
    }));

    // Sort: owner first, then partner, then branch_manager, then admin_staff
    const order: Record<UserRole, number> = {
      owner: 0, partner: 1, branch_manager: 2, admin_staff: 3,
    };
    members.sort((a, b) => order[a.role] - order[b.role]);

    return { data: members };
  } catch (e) {
    console.error("[listMembersAction]", e);
    return { error: e instanceof Error ? e.message : "خطأ غير متوقع" };
  }
}

/**
 * Update a member's role, finance access flag, and branch assignments.
 * Cannot change the owner's role or your own role.
 */
export async function updateMemberAction(
  targetUserId: string,
  data: {
    role: "partner" | "branch_manager" | "admin_staff";
    hasFinanceAccess: boolean;
    branchIds: string[];
  }
): Promise<{ error?: string }> {
  try {
    const auth = await requireOwner();
    if ("error" in auth) return { error: auth.error };

    if (targetUserId === auth.userId) {
      return { error: "لا يمكنك تغيير دورك الخاص" };
    }

    if (data.role !== "partner" && data.branchIds.length === 0) {
      return { error: "يجب تحديد فرع واحد على الأقل" };
    }

    const admin = createAdminClient();

    // Verify target exists and is not the owner
    const { data: target } = await admin
      .from("academy_members")
      .select("role")
      .eq("user_id", targetUserId)
      .eq("academy_id", auth.academyId)
      .maybeSingle();

    if (!target) return { error: "العضو غير موجود" };
    if (target.role === "owner") return { error: "لا يمكن تغيير دور المالك" };

    const newHasFinanceAccess =
      data.role === "partner"
        ? true
        : data.role === "branch_manager"
        ? data.hasFinanceAccess
        : false;

    // 1) Update role + finance access
    const { error: updateErr } = await admin
      .from("academy_members")
      .update({ role: data.role, has_finance_access: newHasFinanceAccess })
      .eq("user_id", targetUserId)
      .eq("academy_id", auth.academyId);

    if (updateErr) return { error: updateErr.message };

    // 2) Replace branch access entries
    await admin
      .from("member_branch_access")
      .delete()
      .eq("user_id", targetUserId)
      .eq("academy_id", auth.academyId);

    if (data.role !== "partner" && data.branchIds.length > 0) {
      const rows = data.branchIds.map((branchId) => ({
        academy_id: auth.academyId,
        user_id:    targetUserId,
        branch_id:  branchId,
      }));
      const { error: insertErr } = await admin
        .from("member_branch_access")
        .insert(rows);

      if (insertErr) return { error: insertErr.message };
    }

    return {};
  } catch (e) {
    console.error("[updateMemberAction]", e);
    return { error: e instanceof Error ? e.message : "خطأ غير متوقع" };
  }
}

/**
 * Remove a member from the academy (owner/partner only).
 * Cannot remove the academy owner or yourself.
 */
export async function removeMemberAction(
  targetUserId: string
): Promise<{ error?: string }> {
  try {
    const auth = await requireOwner();
    if ("error" in auth) return { error: auth.error };

    if (targetUserId === auth.userId) {
      return { error: "لا يمكنك إزالة نفسك" };
    }

    const admin = createAdminClient();

    // Verify target is not the owner
    const { data: target } = await admin
      .from("academy_members")
      .select("role")
      .eq("user_id", targetUserId)
      .eq("academy_id", auth.academyId)
      .maybeSingle();

    if (!target) return { error: "العضو غير موجود" };
    if (target.role === "owner") return { error: "لا يمكن إزالة المالك" };

    // Delete branch access first, then membership
    await admin
      .from("member_branch_access")
      .delete()
      .eq("user_id", targetUserId)
      .eq("academy_id", auth.academyId);

    const { error } = await admin
      .from("academy_members")
      .delete()
      .eq("user_id", targetUserId)
      .eq("academy_id", auth.academyId);

    if (error) return { error: error.message };
    return {};
  } catch (e) {
    console.error("[removeMemberAction]", e);
    return { error: e instanceof Error ? e.message : "خطأ غير متوقع" };
  }
}

// ── Invitation acceptance (invitee) ───────────────────────────────────────────

/**
 * Accept an invitation by token.
 *
 * Uses admin client for token lookup (token = authorization credential).
 * Email match is enforced in application code.
 *
 * On success:
 *   - Upserts academy_members with role + has_finance_access
 *   - Inserts member_branch_access rows for branch-scoped roles
 *   - Updates profiles.academy_id to the invited academy
 *   - Marks invitation as accepted
 */
export async function acceptInvitationAction(
  token: string
): Promise<{ error?: string }> {
  try {
    if (!token || typeof token !== "string" || token.length < 10) {
      return { error: "رمز الدعوة غير صالح" };
    }

    const supabase = await createClient();

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) return { error: "يجب تسجيل الدخول أولاً" };

    // Read invitation via admin client (token is the authorization credential)
    const admin = createAdminClient();
    const { data: inv, error: invErr } = await admin
      .from("invitations")
      .select("id, academy_id, email, role, branch_ids, has_finance_access, expires_at, accepted_at")
      .eq("token", token)
      .maybeSingle();

    if (invErr) return { error: `خطأ في قراءة الدعوة: ${invErr.message}` };
    if (!inv)   return { error: "الدعوة غير موجودة أو منتهية الصلاحية" };

    if (inv.accepted_at) return { error: "تم استخدام هذه الدعوة مسبقاً" };
    if (new Date(inv.expires_at) < new Date()) {
      return { error: "انتهت صلاحية الدعوة (7 أيام منذ الإرسال)" };
    }
    if (inv.email.toLowerCase() !== user.email?.toLowerCase()) {
      return {
        error: `هذه الدعوة مخصصة للبريد "${inv.email}" فقط. تأكد من تسجيل الدخول بالبريد الصحيح.`,
      };
    }

    // 1) Add to academy_members
    const hasFinanceAccess =
      inv.role === "partner" ? true : (inv.has_finance_access ?? false);

    // Safety guard: prevent accidental owner role downgrade.
    // If this user is already the owner of the target academy, the invitation
    // cannot apply (owner cannot be demoted via invite acceptance).
    const { data: existingMember } = await admin
      .from("academy_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("academy_id", inv.academy_id)
      .maybeSingle();

    if (existingMember?.role === "owner") {
      return { error: "أنت بالفعل مالك هذه الأكاديمية — لا حاجة لقبول دعوة" };
    }

    // Use admin client for the upsert so it succeeds regardless of the current
    // member's RLS update permissions (a branch_manager/admin_staff cannot
    // UPDATE their own row via the regular client; using admin avoids the block
    // while the application-level owner guard above ensures the owner is safe).
    const { error: mErr } = await admin
      .from("academy_members")
      .upsert(
        {
          academy_id:         inv.academy_id,
          user_id:            user.id,
          role:               inv.role,
          has_finance_access: hasFinanceAccess,
        },
        { onConflict: "academy_id,user_id" }
      );

    if (mErr) return { error: `فشل إضافة العضوية: ${mErr.message}` };

    // 2) Set branch access for branch-scoped roles
    const branchIds: string[] = inv.branch_ids ?? [];
    if (inv.role !== "partner" && branchIds.length > 0) {
      // Clear any existing entries first (idempotent)
      await admin
        .from("member_branch_access")
        .delete()
        .eq("user_id", user.id)
        .eq("academy_id", inv.academy_id);

      const rows = branchIds.map((branchId) => ({
        academy_id: inv.academy_id,
        user_id:    user.id,
        branch_id:  branchId,
      }));
      const { error: baErr } = await admin
        .from("member_branch_access")
        .insert(rows);

      if (baErr) return { error: `فشل تعيين الفروع: ${baErr.message}` };
    }

    // 3) Update profile to point to the invited academy
    const { error: pErr } = await supabase
      .from("profiles")
      .upsert(
        { user_id: user.id, academy_id: inv.academy_id },
        { onConflict: "user_id" }
      );

    if (pErr) return { error: `فشل تحديث الملف الشخصي: ${pErr.message}` };

    // 4) Mark invitation as accepted
    await admin
      .from("invitations")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", inv.id);

    return {};
  } catch (e) {
    console.error("[acceptInvitationAction]", e);
    return {
      error: e instanceof Error ? e.message : "خطأ غير متوقع أثناء قبول الدعوة",
    };
  }
}
