"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/app/components/ui/Button";
import { createClient } from "@/src/lib/supabase/browser";
import {
  listInvitationsAction,
  createInvitationAction,
  deleteInvitationAction,
  listMembersAction,
  updateMemberAction,
  removeMemberAction,
  type MemberInfo,
} from "@/app/invite/actions";
import type { DbInvitation } from "@/src/lib/supabase/invitations";
import { getUserRole, roleLabel, type UserRole } from "@/src/lib/supabase/roles";
import type { DbBranch } from "@/src/lib/supabase/branches";

// ── Role badge colors ──────────────────────────────────────────────────────────
const ROLE_COLOR: Record<UserRole, string> = {
  owner:         "bg-emerald-500/15 text-emerald-300 border-emerald-500/20",
  partner:       "bg-sky-500/15     text-sky-300     border-sky-500/20",
  branch_manager:"bg-violet-500/15  text-violet-300  border-violet-500/20",
  admin_staff:   "bg-white/10       text-white/60    border-white/10",
};

function RoleBadge({ role }: { role: UserRole }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs border ${ROLE_COLOR[role]}`}>
      {roleLabel[role]}
    </span>
  );
}

// ── Branch multi-select ────────────────────────────────────────────────────────
function BranchSelect({
  branches,
  selected,
  onChange,
}: {
  branches: DbBranch[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  if (branches.length === 0) {
    return (
      <p className="text-xs text-white/40 italic">لا توجد فروع في الأكاديمية بعد.</p>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {branches.map((b) => {
        const checked = selected.includes(b.id);
        return (
          <button
            key={b.id}
            type="button"
            onClick={() =>
              onChange(
                checked
                  ? selected.filter((id) => id !== b.id)
                  : [...selected, b.id]
              )
            }
            className={[
              "h-8 px-3 rounded-lg text-xs border transition",
              checked
                ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10",
            ].join(" ")}
          >
            {b.name}
          </button>
        );
      })}
    </div>
  );
}

// ── Branch name resolver ───────────────────────────────────────────────────────
function branchNames(ids: string[], branches: DbBranch[]): string {
  if (ids.length === 0) return "جميع الفروع";
  return ids
    .map((id) => branches.find((b) => b.id === id)?.name ?? "—")
    .join("، ");
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function TeamPage() {
  const supabase = createClient();

  const [loading, setLoading]       = useState(true);
  const [pageError, setPageError]   = useState<string | null>(null);
  const [members, setMembers]       = useState<MemberInfo[]>([]);
  const [invitations, setInvitations] = useState<DbInvitation[]>([]);
  const [branches, setBranches]     = useState<DbBranch[]>([]);

  // ── Invite form ──────────────────────────────────────────────────────────────
  const [inviteEmail, setInviteEmail]       = useState("");
  const [inviteRole, setInviteRole]         = useState<"partner" | "branch_manager" | "admin_staff">("admin_staff");
  const [inviteBranchIds, setInviteBranchIds] = useState<string[]>([]);
  const [inviteHasFinance, setInviteHasFinance] = useState(false);
  const [inviting, setInviting]             = useState(false);
  const [inviteMsg, setInviteMsg]           = useState<{ text: string; ok: boolean } | null>(null);

  // ── Copy link ────────────────────────────────────────────────────────────────
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // ── Member edit ──────────────────────────────────────────────────────────────
  const [editingId, setEditingId]         = useState<string | null>(null);
  const [editRole, setEditRole]           = useState<"partner" | "branch_manager" | "admin_staff">("admin_staff");
  const [editBranchIds, setEditBranchIds] = useState<string[]>([]);
  const [editHasFinance, setEditHasFinance] = useState(false);
  const [saving, setSaving]               = useState(false);
  const [editMsg, setEditMsg]             = useState<string | null>(null);

  // ── Load ─────────────────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true);
    setPageError(null);
    try {
      const role = await getUserRole();

      if (role !== "owner" && role !== "partner") {
        setPageError("هذه الصفحة متاحة لمالك الأكاديمية أو الشريك فقط.");
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setPageError("يرجى تسجيل الدخول."); return; }

      // Fetch branches (for the branch-selection UI)
      const { data: profile } = await supabase
        .from("profiles")
        .select("academy_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profile?.academy_id) {
        const { data: branchData } = await supabase
          .from("branches")
          .select("*")
          .eq("academy_id", profile.academy_id)
          .order("created_at", { ascending: true });
        setBranches((branchData ?? []) as DbBranch[]);
      }

      // Fetch members + invitations via server actions (tokens stay server-side)
      const [membersRes, invRes] = await Promise.all([
        listMembersAction(),
        listInvitationsAction(),
      ]);

      if (membersRes.error) throw new Error(membersRes.error);
      if (invRes.error)     throw new Error(invRes.error);

      setMembers(membersRes.data ?? []);
      setInvitations(invRes.data ?? []);
    } catch (e) {
      setPageError(e instanceof Error ? e.message : "خطأ في تحميل البيانات");
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Send invite ───────────────────────────────────────────────────────────────
  async function sendInvite() {
    setInviteMsg(null);
    const email = inviteEmail.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setInviteMsg({ text: "يرجى إدخال بريد إلكتروني صحيح.", ok: false });
      return;
    }
    if (inviteRole !== "partner" && inviteBranchIds.length === 0) {
      setInviteMsg({ text: "يرجى تحديد فرع واحد على الأقل.", ok: false });
      return;
    }

    setInviting(true);
    try {
      const result = await createInvitationAction(
        email,
        inviteRole,
        inviteBranchIds,
        inviteRole === "branch_manager" ? inviteHasFinance : false
      );
      if (result.error) { setInviteMsg({ text: result.error, ok: false }); return; }
      if (result.data)  setInvitations((prev) => [result.data!, ...prev]);
      setInviteEmail("");
      setInviteBranchIds([]);
      setInviteHasFinance(false);
      setInviteMsg({ text: `✅ تم إرسال الدعوة إلى ${email}`, ok: true });
    } catch (e) {
      setInviteMsg({ text: e instanceof Error ? e.message : "فشل إرسال الدعوة", ok: false });
    } finally {
      setInviting(false);
    }
  }

  // ── Revoke invite ─────────────────────────────────────────────────────────────
  async function revokeInvite(id: string) {
    const result = await deleteInvitationAction(id);
    if (!result.error) setInvitations((prev) => prev.filter((i) => i.id !== id));
  }

  // ── Copy invite link ──────────────────────────────────────────────────────────
  function copyLink(token: string, id: string) {
    navigator.clipboard.writeText(`${window.location.origin}/invite/${token}`).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }

  // ── Start editing a member ────────────────────────────────────────────────────
  function startEdit(m: MemberInfo) {
    setEditingId(m.userId);
    setEditRole(m.role === "owner" ? "partner" : m.role as "partner" | "branch_manager" | "admin_staff");
    setEditBranchIds(m.branchIds);
    setEditHasFinance(m.hasFinanceAccess);
    setEditMsg(null);
  }

  // ── Save member edit ──────────────────────────────────────────────────────────
  async function saveEdit(targetUserId: string) {
    setSaving(true);
    setEditMsg(null);
    const result = await updateMemberAction(targetUserId, {
      role:             editRole,
      hasFinanceAccess: editRole === "branch_manager" ? editHasFinance : editRole === "partner",
      branchIds:        editRole === "partner" ? [] : editBranchIds,
    });
    setSaving(false);
    if (result.error) { setEditMsg(result.error); return; }
    setEditingId(null);
    // Refresh member list
    const res = await listMembersAction();
    if (res.data) setMembers(res.data);
  }

  // ── Remove member ─────────────────────────────────────────────────────────────
  async function removeMember(userId: string) {
    if (!confirm("هل أنت متأكد من إزالة هذا العضو؟")) return;
    const result = await removeMemberAction(userId);
    if (!result.error) setMembers((prev) => prev.filter((m) => m.userId !== userId));
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <main className="flex-1 p-8 max-w-4xl">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">إدارة الفريق</h1>
          <p className="text-white/60 mt-1">دعوة أعضاء جدد وإدارة أدوار الفريق وصلاحيات الفروع</p>
        </div>

        {loading && <div className="text-white/60 text-sm">جاري التحميل...</div>}

        {pageError && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-red-300">
            {pageError}
          </div>
        )}

        {!loading && !pageError && (
          <div className="space-y-8">

            {/* ── Invite form ─────────────────────────────────────────────── */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
              <h2 className="font-semibold text-white/90">دعوة عضو جديد</h2>
              <p className="text-xs text-white/50">
                يحصل العضو على رابط دعوة. يجب عليه التسجيل أو تسجيل الدخول بنفس البريد.
              </p>

              {/* Email + Role */}
              <div className="flex gap-3 flex-wrap">
                <input
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendInvite()}
                  placeholder="البريد الإلكتروني"
                  type="email"
                  dir="ltr"
                  className="flex-1 min-w-[220px] h-11 rounded-xl bg-[#0F172A] border border-white/10 px-4 outline-none focus:border-white/25"
                  disabled={inviting}
                />
                <select
                  value={inviteRole}
                  onChange={(e) => {
                    setInviteRole(e.target.value as typeof inviteRole);
                    setInviteBranchIds([]);
                    setInviteHasFinance(false);
                  }}
                  className="h-11 rounded-xl bg-[#0F172A] border border-white/10 px-4 outline-none"
                  disabled={inviting}
                >
                  <option value="partner">شريك</option>
                  <option value="branch_manager">مدير فرع</option>
                  <option value="admin_staff">اداري</option>
                </select>
                <Button onClick={sendInvite} disabled={inviting}>
                  {inviting ? "جاري الإرسال..." : "إرسال دعوة"}
                </Button>
              </div>

              {/* Branch selection (branch_manager / admin_staff only) */}
              {inviteRole !== "partner" && (
                <div className="space-y-2">
                  <label className="text-xs text-white/60">
                    الفروع المسموح بها <span className="text-red-400">*</span>
                  </label>
                  <BranchSelect
                    branches={branches}
                    selected={inviteBranchIds}
                    onChange={setInviteBranchIds}
                  />
                </div>
              )}

              {/* Finance access toggle (branch_manager only) */}
              {inviteRole === "branch_manager" && (
                <label className="flex items-center gap-3 cursor-pointer select-none w-fit">
                  <input
                    type="checkbox"
                    checked={inviteHasFinance}
                    onChange={(e) => setInviteHasFinance(e.target.checked)}
                    className="w-4 h-4 accent-emerald-400"
                  />
                  <span className="text-sm text-white/70">
                    منح صلاحية الإدارة المالية للفروع المحددة
                  </span>
                </label>
              )}

              {inviteMsg && (
                <div
                  className={`rounded-xl border px-4 py-2 text-sm ${
                    inviteMsg.ok
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                      : "border-red-500/30 bg-red-500/10 text-red-300"
                  }`}
                >
                  {inviteMsg.text}
                </div>
              )}
            </div>

            {/* ── Pending invitations ──────────────────────────────────────── */}
            {invitations.length > 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
                <h2 className="font-semibold text-white/90">
                  دعوات بانتظار القبول ({invitations.length})
                </h2>

                <div className="space-y-2">
                  {invitations.map((inv) => {
                    const expired = new Date(inv.expires_at) < new Date();
                    return (
                      <div
                        key={inv.id}
                        className="flex items-center justify-between gap-4 rounded-xl bg-white/5 px-4 py-3"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium truncate" dir="ltr">
                              {inv.email}
                            </span>
                            <RoleBadge role={inv.role} />
                            {inv.has_finance_access && inv.role === "branch_manager" && (
                              <span className="px-2 py-0.5 rounded-full text-xs border border-amber-500/30 bg-amber-500/10 text-amber-300">
                                مالي
                              </span>
                            )}
                            {expired && (
                              <span className="text-xs text-red-400">• منتهية</span>
                            )}
                          </div>
                          {inv.role !== "partner" && inv.branch_ids.length > 0 && (
                            <div className="text-xs text-white/40 mt-1">
                              الفروع: {branchNames(inv.branch_ids, branches)}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => copyLink(inv.token, inv.id)}
                            className="h-8 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-xs transition"
                          >
                            {copiedId === inv.id ? "✓ تم النسخ" : "نسخ الرابط"}
                          </button>
                          <button
                            onClick={() => revokeInvite(inv.id)}
                            className="h-8 px-3 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs transition"
                          >
                            إلغاء
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <p className="text-xs text-white/40">
                  * صلاحية الرابط 7 أيام. انسخه وأرسله للعضو عبر واتساب أو بريد إلكتروني.
                </p>
              </div>
            )}

            {/* ── Current members ───────────────────────────────────────────── */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
              <h2 className="font-semibold text-white/90">
                أعضاء الفريق ({members.length})
              </h2>

              <div className="space-y-2">
                {members.map((m) => {
                  const isOwnerRow = m.role === "owner";
                  const isEditing  = editingId === m.userId;

                  return (
                    <div
                      key={m.userId}
                      className="rounded-xl bg-white/5 px-4 py-3 space-y-3"
                    >
                      {/* Member header */}
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium">{m.fullName}</span>
                            <RoleBadge role={m.role} />
                            {m.hasFinanceAccess && m.role === "branch_manager" && (
                              <span className="px-2 py-0.5 rounded-full text-xs border border-amber-500/30 bg-amber-500/10 text-amber-300">
                                مالي
                              </span>
                            )}
                          </div>
                          {m.branchIds.length > 0 && (
                            <div className="text-xs text-white/40 mt-0.5">
                              الفروع: {branchNames(m.branchIds, branches)}
                            </div>
                          )}
                          {(m.role === "owner" || m.role === "partner") && (
                            <div className="text-xs text-white/30 mt-0.5">
                              {m.role === "owner" ? "وصول كامل للأكاديمية" : "وصول كامل للأكاديمية"}
                            </div>
                          )}
                        </div>

                        {!isOwnerRow && !isEditing && (
                          <div className="flex gap-2 shrink-0">
                            <button
                              onClick={() => startEdit(m)}
                              className="h-8 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-xs transition"
                            >
                              تعديل
                            </button>
                            <button
                              onClick={() => removeMember(m.userId)}
                              className="h-8 px-3 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs transition"
                            >
                              إزالة
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Inline edit form */}
                      {isEditing && (
                        <div className="border-t border-white/10 pt-3 space-y-3">
                          {/* Role */}
                          <div>
                            <label className="block text-xs text-white/60 mb-1">الدور</label>
                            <select
                              value={editRole}
                              onChange={(e) => {
                                setEditRole(e.target.value as typeof editRole);
                                setEditBranchIds([]);
                                setEditHasFinance(false);
                              }}
                              className="h-9 rounded-lg bg-[#0F172A] border border-white/10 px-3 text-sm outline-none"
                            >
                              <option value="partner">شريك</option>
                              <option value="branch_manager">مدير فرع</option>
                              <option value="admin_staff">اداري</option>
                            </select>
                          </div>

                          {/* Branch selection */}
                          {editRole !== "partner" && (
                            <div>
                              <label className="block text-xs text-white/60 mb-1">
                                الفروع المسموح بها <span className="text-red-400">*</span>
                              </label>
                              <BranchSelect
                                branches={branches}
                                selected={editBranchIds}
                                onChange={setEditBranchIds}
                              />
                            </div>
                          )}

                          {/* Finance toggle for branch_manager */}
                          {editRole === "branch_manager" && (
                            <label className="flex items-center gap-3 cursor-pointer select-none w-fit">
                              <input
                                type="checkbox"
                                checked={editHasFinance}
                                onChange={(e) => setEditHasFinance(e.target.checked)}
                                className="w-4 h-4 accent-emerald-400"
                              />
                              <span className="text-sm text-white/70">
                                صلاحية الإدارة المالية
                              </span>
                            </label>
                          )}

                          {editMsg && (
                            <p className="text-xs text-red-300">{editMsg}</p>
                          )}

                          <div className="flex gap-2">
                            <Button
                              onClick={() => saveEdit(m.userId)}
                              disabled={saving}
                            >
                              {saving ? "جاري الحفظ..." : "حفظ"}
                            </Button>
                            <Button
                              onClick={() => { setEditingId(null); setEditMsg(null); }}
                              disabled={saving}
                            >
                              إلغاء
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Role guide ────────────────────────────────────────────────── */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-3">
              <h2 className="font-semibold text-white/90">دليل الصلاحيات</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                {(
                  [
                    {
                      role: "مالك",
                      color: "emerald",
                      perms: ["كل الصفحات", "إدارة الفريق", "الإدارة المالية (كاملة)", "إدارة الأكاديمية"],
                    },
                    {
                      role: "شريك",
                      color: "sky",
                      perms: ["كل الصفحات", "إدارة الفريق", "الإدارة المالية (كاملة)", "بدون إدارة الأكاديمية"],
                    },
                    {
                      role: "مدير فرع",
                      color: "violet",
                      perms: ["اللاعبين (CRUD - فروعه)", "الطاقم (CRUD - فروعه)", "المالية (اختياري)", "لا إدارة أكاديمية"],
                    },
                    {
                      role: "اداري",
                      color: "white",
                      perms: ["اللاعبين (CRUD - فروعه)", "لا طاقم", "لا مالية", "عرض الفروع المحددة فقط"],
                    },
                  ] as const
                ).map(({ role, color, perms }) => (
                  <div
                    key={role}
                    className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2"
                  >
                    <div className={`font-semibold text-${color}-300`}>{role}</div>
                    <ul className="space-y-1 text-white/60">
                      {perms.map((p) => (
                        <li key={p}>• {p}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}
      </main>
  );
}
