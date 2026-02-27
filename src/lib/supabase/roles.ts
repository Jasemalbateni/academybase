import { createClient } from "./browser";
import { resolveAcademyId } from "./academyId";

// ── Types ──────────────────────────────────────────────────────────────────────

export type UserRole = "owner" | "partner" | "branch_manager" | "admin_staff";

/**
 * Full membership snapshot for the current user.
 * Fetched once per page mount and passed down to components that need it.
 */
export type MembershipInfo = {
  role: UserRole;
  /** true for owner/partner always; branch_manager only if explicitly granted */
  hasFinanceAccess: boolean;
  /**
   * UUIDs of branches this member can access.
   * Empty array means full-academy access (owner / partner).
   */
  branchIds: string[];
};

// ── Data fetching ──────────────────────────────────────────────────────────────

/**
 * Returns full membership info for the current browser-session user.
 * Falls back to the most restrictive role when no session or no membership row.
 *
 * Uses resolveAcademyId() so the profiles round-trip is shared with all other
 * lib functions that call it concurrently — only one DB query fires per session.
 */
export async function getMembership(): Promise<MembershipInfo> {
  const supabase = createClient();

  // getSession() reads the in-memory/cookie session — no network call.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) {
    return { role: "admin_staff", hasFinanceAccess: false, branchIds: [] };
  }

  // resolveAcademyId() uses a shared Promise cache — concurrent callers all
  // share the same in-flight request so only ONE profiles query fires.
  let academyId: string;
  try {
    academyId = await resolveAcademyId();
  } catch {
    // No academy linked yet (e.g. invited user still completing setup) →
    // treat as the most restrictive role.
    return { role: "admin_staff", hasFinanceAccess: false, branchIds: [] };
  }

  const [memberRes, branchRes] = await Promise.all([
    supabase
      .from("academy_members")
      .select("role, has_finance_access")
      .eq("user_id", user.id)
      .eq("academy_id", academyId)
      .maybeSingle(),
    supabase
      .from("member_branch_access")
      .select("branch_id")
      .eq("user_id", user.id)
      .eq("academy_id", academyId),
  ]);

  // A real DB error (e.g. 42P17 recursion) must surface, not be silently
  // swallowed.  Falling back to admin_staff on an error would cause the owner
  // to appear as "اداري" and block all data access.
  if (memberRes.error) {
    throw new Error(
      `فشل تحميل صلاحيات العضوية: ${memberRes.error.message} [${memberRes.error.code}]`
    );
  }

  const role = (memberRes.data?.role as UserRole) ?? "admin_staff";
  const hasFinanceAccess =
    role === "owner" || role === "partner"
      ? true
      : (memberRes.data?.has_finance_access ?? false);
  const branchIds = (branchRes.data ?? []).map((r: { branch_id: unknown }) => r.branch_id as string);

  return { role, hasFinanceAccess, branchIds };
}

/**
 * Convenience wrapper — returns only the role.
 * Use getMembership() when you also need hasFinanceAccess or branchIds.
 */
export async function getUserRole(): Promise<UserRole> {
  const { role } = await getMembership();
  return role;
}

// ── Permission helpers ─────────────────────────────────────────────────────────

/** Owner or partner — full academy access */
export const isOwnerOrPartner = (r: UserRole) =>
  r === "owner" || r === "partner";

/** Only the registering owner */
export const isOwner = (r: UserRole) => r === "owner";

/** Roles that can manage staff */
export const canManageStaff = (r: UserRole) =>
  r === "owner" || r === "partner" || r === "branch_manager";

/** Human-readable Arabic label for each role */
export const roleLabel: Record<UserRole, string> = {
  owner:         "مالك",
  partner:       "شريك",
  branch_manager: "مدير فرع",
  admin_staff:   "اداري",
};
