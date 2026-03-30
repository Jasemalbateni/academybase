"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/app/components/ui/Button";
import { Modal } from "@/app/components/ui/Modal";
import {
  type DbStaff,
  listStaff,
  createStaffMember,
  updateStaffMember,
  deleteStaffMember,
} from "@/src/lib/supabase/staff";
import {
  type DbBranch,
  listBranches,
} from "@/src/lib/supabase/branches";
import {
  listStaffAttendance,
  countSessionsInMonth,
  type DbStaffAttendance,
} from "@/src/lib/supabase/staff-attendance";
import { getMembership, canManageStaff } from "@/src/lib/supabase/roles";
import { formatError } from "@/src/lib/utils";
import { Skeleton } from "@/app/components/Skeleton";

// ── Types ─────────────────────────────────────────────────────────────────────
type StaffRole = "مدرب" | "إداري" | "موظف";
type AssignMode = "single" | "multi" | "all";

// Frontend type (camelCase)
type StaffMember = {
  id: string;
  name: string;
  role: StaffRole;
  jobTitle?: string;
  monthlySalary: number;
  branchIds: string[];
  assignMode: AssignMode;
  isActive: boolean;
};

type BranchLite = { id: string; name: string; days: string[] };

function dbToStaff(db: DbStaff): StaffMember {
  return {
    id: db.id,
    name: db.name,
    role: db.role as StaffRole,
    jobTitle: db.job_title ?? undefined,
    monthlySalary: Number(db.monthly_salary),
    branchIds: db.branch_ids ?? [],
    assignMode: db.assign_mode as AssignMode,
    isActive: db.is_active,
  };
}

// ── Salary breakdown type ──────────────────────────────────────────────────────
type SalaryBreakdown = {
  baseSalary:     number;
  sessionsInMonth: number;
  attended:       number;
  absences:       number;
  totalDeduction: number;
  netSalary:      number;
};

// ── Page ──────────────────────────────────────────────────────────────────────
export default function StaffPage() {
  const [branches, setBranches] = useState<BranchLite[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);

  const [staffAttendance, setStaffAttendance] = useState<DbStaffAttendance[]>([]);
  const [expandedStaffId, setExpandedStaffId] = useState<string | null>(null);
  const currentMonth = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }, []);

  const [canManage, setCanManage] = useState(false);

  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // modal
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // form
  const [name, setName] = useState("");
  const [role, setRole] = useState<StaffRole>("مدرب");
  const [jobTitle, setJobTitle] = useState("");
  const [monthlySalary, setMonthlySalary] = useState<number>(0);
  const [isActive, setIsActive] = useState(true);
  const [assignMode, setAssignMode] = useState<AssignMode>("single");
  const [singleBranchId, setSingleBranchId] = useState<string>("");
  const [multiBranchIds, setMultiBranchIds] = useState<Record<string, boolean>>({});

  // ── Load ──────────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    setPageError(null);
    try {
      const [dbBranches, dbStaff, dbAttendance, membership] = await Promise.all([
        listBranches(),
        listStaff(),
        listStaffAttendance(currentMonth),
        getMembership(),
      ]);
      setCanManage(canManageStaff(membership.role));
      const b: BranchLite[] = dbBranches.map((x: DbBranch) => ({
        id:   x.id,
        name: x.name,
        days: x.days ?? [],
      }));
      setStaffAttendance(dbAttendance);
      setBranches(b);
      setStaff(dbStaff.map(dbToStaff));
      if (b.length) setSingleBranchId(b[0].id);
      const initial: Record<string, boolean> = {};
      b.forEach((br) => (initial[br.id] = false));
      setMultiBranchIds(initial);
    } catch (e) {
      console.error("[staff] load error:", e);
      setPageError(formatError(e));
    } finally {
      setLoading(false);
    }
  }, [currentMonth]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const totalActiveSalary = useMemo(
    () =>
      staff
        .filter((m) => m.isActive)
        .reduce((sum, m) => sum + (m.monthlySalary || 0), 0),
    [staff]
  );

  // Salary breakdown per staff member for the current month
  const salaryBreakdownMap = useMemo(() => {
    const [yearStr, monStr] = currentMonth.split("-");
    const year  = Number(yearStr);
    const month = Number(monStr);

    const branchMap = new Map(branches.map((b) => [b.id, b]));

    return new Map<string, SalaryBreakdown>(
      staff.map((m) => {
        // Resolve effective branch list
        const effectiveBranchIds =
          m.assignMode === "all" ? branches.map((b) => b.id) : m.branchIds;

        const branchCount = Math.max(1, effectiveBranchIds.length);

        let totalSessions = 0;
        let totalAttended = 0;
        let totalAbsences = 0;
        let totalDeduction = 0;

        for (const branchId of effectiveBranchIds) {
          const branch = branchMap.get(branchId);
          const sessionsInBranch = branch
            ? countSessionsInMonth(year, month, branch.days)
            : 0;
          totalSessions += sessionsInBranch;

          const branchRecords = staffAttendance.filter(
            (a) => a.staff_id === m.id && a.branch_id === branchId
          );

          const attended = branchRecords.filter(
            (a) => a.status === "present" || a.status === "late"
          ).length;
          totalAttended += attended;

          const absences = branchRecords.filter(
            (a) => a.deduct_from_salary
          ).length;
          totalAbsences += absences;

          const deduction = branchRecords
            .filter((a) => a.deduct_from_salary)
            .reduce((s, a) => s + (a.deduction_amount || 0), 0);
          totalDeduction += deduction;

          // If no explicit deduction_amount recorded, estimate from salary ÷ sessions
          if (absences > 0 && deduction === 0 && sessionsInBranch > 0) {
            const perSession = (m.monthlySalary / branchCount) / sessionsInBranch;
            totalDeduction += absences * perSession;
          }
        }

        totalDeduction = Math.round(totalDeduction * 100) / 100;

        return [
          m.id,
          {
            baseSalary:      m.monthlySalary,
            sessionsInMonth: totalSessions,
            attended:        totalAttended,
            absences:        totalAbsences,
            totalDeduction,
            netSalary:       Math.max(0, m.monthlySalary - totalDeduction),
          },
        ];
      })
    );
  }, [staff, branches, staffAttendance, currentMonth]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  function resetForm() {
    setName("");
    setRole("مدرب");
    setJobTitle("");
    setMonthlySalary(0);
    setIsActive(true);
    setAssignMode("single");
    setSingleBranchId(branches[0]?.id || "");
    const initial: Record<string, boolean> = {};
    branches.forEach((br) => (initial[br.id] = false));
    setMultiBranchIds(initial);
    setEditingId(null);
    setSaveError(null);
  }

  function toggleMultiBranch(id: string) {
    setMultiBranchIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function resolveBranchIds(mode: AssignMode): string[] {
    if (!branches.length) return [];
    if (mode === "all") return branches.map((b) => b.id);
    if (mode === "single") return [singleBranchId || branches[0].id];
    return branches.filter((b) => multiBranchIds[b.id]).map((b) => b.id);
  }

  function validate(): string | null {
    if (!name.trim()) return "أدخل اسم الموظف.";
    if (monthlySalary < 0) return "الراتب لا يمكن أن يكون سالباً";
    if (role === "موظف" && !jobTitle.trim())
      return "أدخل مسمى وظيفة الموظف (مثال: تسويق).";
    if (resolveBranchIds(assignMode).length === 0)
      return "اختر فرع واحد على الأقل.";
    return null;
  }

  // ── Modal openers ──────────────────────────────────────────────────────────
  function openAddModal() {
    resetForm();
    setOpen(true);
  }

  function openEditModal(id: string) {
    const m = staff.find((x) => x.id === id);
    if (!m) return;
    setEditingId(id);
    setName(m.name);
    setRole(m.role);
    setJobTitle(m.jobTitle ?? "");
    setMonthlySalary(m.monthlySalary);
    setIsActive(m.isActive);
    setAssignMode(m.assignMode);
    if (m.assignMode === "single") {
      setSingleBranchId(m.branchIds?.[0] ?? branches[0]?.id ?? "");
      const initial: Record<string, boolean> = {};
      branches.forEach((br) => (initial[br.id] = false));
      setMultiBranchIds(initial);
    } else if (m.assignMode === "multi") {
      const map: Record<string, boolean> = {};
      branches.forEach((b) => {
        map[b.id] = (m.branchIds || []).includes(b.id);
      });
      setMultiBranchIds(map);
    } else {
      const initial: Record<string, boolean> = {};
      branches.forEach((br) => (initial[br.id] = false));
      setMultiBranchIds(initial);
    }
    setSaveError(null);
    setOpen(true);
  }

  // ── Save ───────────────────────────────────────────────────────────────────
  async function saveStaff() {
    const err = validate();
    if (err) {
      setSaveError(err);
      return;
    }
    const branchIds = resolveBranchIds(assignMode);

    setSaving(true);
    setSaveError(null);
    try {
      const payload = {
        name: name.trim(),
        role,
        job_title: role === "موظف" ? jobTitle.trim() : null,
        monthly_salary: Number(monthlySalary),
        branch_ids: branchIds,
        assign_mode: assignMode,
        is_active: isActive,
      };

      if (editingId) {
        const updated = await updateStaffMember(editingId, payload);
        setStaff((prev) =>
          prev.map((m) => (m.id === editingId ? dbToStaff(updated) : m))
        );
      } else {
        const created = await createStaffMember(payload);
        setStaff((prev) => [dbToStaff(created), ...prev]);
      }

      setOpen(false);
      resetForm();
    } catch (e) {
      console.error("[staff] save error:", e);
      setSaveError(formatError(e));
    } finally {
      setSaving(false);
    }
  }

  async function removeStaff(id: string) {
    if (!confirm("حذف الموظف؟")) return;
    try {
      await deleteStaffMember(id);
      setStaff((prev) => prev.filter((m) => m.id !== id));
    } catch (e) {
      console.error("[staff] delete error:", e);
      alert(formatError(e));
    }
  }

  // ── Display helpers ────────────────────────────────────────────────────────
  function branchLabel(ids: string[]) {
    const map = new Map(branches.map((b) => [b.id, b.name]));
    return (ids || []).map((id) => map.get(id) ?? id).join(" • ");
  }
  function roleLabel(m: StaffMember) {
    if (m.role !== "موظف") return m.role;
    return `${m.role} — ${m.jobTitle ?? ""}`.trim();
  }

  // ── UI ─────────────────────────────────────────────────────────────────────
  return (
    <main className="flex-1 p-4 md:p-8">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold">الطاقم</h1>
            <p className="text-sm text-white/60 mt-1">
              إدارة رواتب الطاقم الشهرية وتعيينهم على الفروع.
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="rounded-xl bg-white/5 border border-white/10 px-4 py-3">
              <div className="text-xs text-white/60">إجمالي رواتب النشطين</div>
              <div className="text-lg font-bold">{totalActiveSalary} د.ك</div>
            </div>
            {canManage && (
              <Button onClick={openAddModal} disabled={loading}>
                + إضافة موظف
              </Button>
            )}
          </div>
        </div>

        {/* Page error */}
        {pageError && (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {pageError}
            <button
              onClick={loadData}
              className="mr-3 underline"
              type="button"
            >
              إعادة المحاولة
            </button>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="mt-4 space-y-2">
            <Skeleton className="h-10 rounded-xl" />
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-xl" />
            ))}
          </div>
        )}

        {/* No branches warning */}
        {!loading && !branches.length && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/70">
            لا توجد فروع. اذهب لصفحة الفروع وأضف فرعًا أولاً.
          </div>
        )}

        {/* Table */}
        {!loading && branches.length > 0 && (
          <div className="mt-6 bg-[#111827] rounded-2xl border border-white/5">

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-white/[0.07]">
              {staff.length === 0 ? (
                <div className="px-4 py-6 text-white/60 text-sm">
                  لا يوجد طاقم بعد. اضغط &quot;إضافة موظف&quot;.
                </div>
              ) : (
                staff.map((m) => {
                  const breakdown = salaryBreakdownMap.get(m.id);
                  const isExpanded = expandedStaffId === m.id;
                  return (
                    <div key={m.id} className="px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-white">{m.name}</div>
                          <div className="text-xs text-white/55 mt-0.5">{roleLabel(m)}</div>
                          <div className="text-xs text-white/45 mt-0.5">{branchLabel(m.branchIds)}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-bold">{m.monthlySalary} د.ك</div>
                          {breakdown && breakdown.totalDeduction > 0 && (
                            <div className="text-xs text-red-400">صافي: {breakdown.netSalary} د.ك</div>
                          )}
                          <span className={m.isActive
                            ? "inline-flex mt-1 px-2 py-0.5 rounded-full text-xs bg-green-500/15 text-green-300"
                            : "inline-flex mt-1 px-2 py-0.5 rounded-full text-xs bg-red-500/15 text-red-300"
                          }>
                            {m.isActive ? "نشط" : "موقوف"}
                          </span>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => setExpandedStaffId(isExpanded ? null : m.id)}
                          className="px-2 py-1 rounded-lg text-xs text-white/50 hover:text-white hover:bg-white/10 transition"
                        >
                          {isExpanded ? "▲ إخفاء" : "▼ تفاصيل الراتب"}
                        </button>
                        {canManage && (
                          <>
                            <Button variant="ghost" size="xs" onClick={() => openEditModal(m.id)}>تعديل</Button>
                            <Button variant="danger" size="xs" onClick={() => removeStaff(m.id)}>حذف</Button>
                          </>
                        )}
                      </div>
                      {isExpanded && breakdown && (
                        <div className="mt-3 rounded-xl bg-black/20 border border-white/10 p-3">
                          <div className="text-xs font-semibold text-white/60 mb-2">تفاصيل الراتب — {currentMonth}</div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="rounded-lg bg-white/5 px-3 py-2 text-center">
                              <div className="text-xs text-white/50">الراتب الأساسي</div>
                              <div className="text-sm font-semibold mt-0.5">{breakdown.baseSalary} د.ك</div>
                            </div>
                            <div className="rounded-lg bg-white/5 px-3 py-2 text-center">
                              <div className="text-xs text-white/50">حصص الشهر</div>
                              <div className="text-sm font-semibold mt-0.5">{breakdown.sessionsInMonth}</div>
                            </div>
                            <div className="rounded-lg bg-white/5 px-3 py-2 text-center">
                              <div className="text-xs text-white/50">حضور مسجّل</div>
                              <div className="text-sm font-semibold text-emerald-400 mt-0.5">{breakdown.attended}</div>
                            </div>
                            <div className="rounded-lg bg-white/5 px-3 py-2 text-center">
                              <div className="text-xs text-white/50">غيابات (خصم)</div>
                              <div className="text-sm font-semibold text-red-400 mt-0.5">{breakdown.absences}</div>
                            </div>
                          </div>
                          {breakdown.totalDeduction > 0 && (
                            <div className="mt-2 text-center text-xs">
                              <span className="text-white/50">صافي الراتب: </span>
                              <span className="text-amber-300 font-bold">{breakdown.netSalary} د.ك</span>
                              <span className="text-red-400 mr-1">(− {breakdown.totalDeduction} خصم)</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
            <div className="min-w-[620px]">
            <div className="bg-[#0F172A] px-6 py-4 text-sm text-white/80 grid grid-cols-[1.6fr_1.2fr_1fr_1.8fr_0.9fr_1.2fr] gap-4">
              <div>الاسم</div>
              <div>الدور</div>
              <div>الراتب الشهري</div>
              <div>الفروع</div>
              <div>الحالة</div>
              <div className="text-right">الإجراء</div>
            </div>

            <div>
              {staff.length === 0 ? (
                <div className="px-6 py-8 text-white/60 text-sm">
                  لا يوجد طاقم بعد. اضغط "إضافة موظف".
                </div>
              ) : (
                staff.map((m, idx) => {
                  const zebra = idx % 2 === 0 ? "bg-[#0B1220]" : "bg-[#0E1A2B]";
                  const breakdown = salaryBreakdownMap.get(m.id);
                  const isExpanded = expandedStaffId === m.id;
                  return (
                    <div key={m.id}>
                      <div
                        className={`${zebra} px-6 py-4 grid grid-cols-[1.6fr_1.2fr_1fr_1.8fr_0.9fr_1.2fr] gap-4 items-center`}
                      >
                        <div className="font-medium">{m.name}</div>
                        <div className="text-white/80">{roleLabel(m)}</div>
                        <div>
                          <div className="text-white/80">{m.monthlySalary} د.ك</div>
                          {breakdown && breakdown.totalDeduction > 0 && (
                            <div className="text-xs text-red-400 mt-0.5">
                              صافي: {breakdown.netSalary} د.ك
                            </div>
                          )}
                        </div>
                        <div className="text-white/80">
                          {branchLabel(m.branchIds)}
                        </div>
                        <div>
                          <span
                            className={
                              m.isActive
                                ? "inline-flex px-3 py-1 rounded-full text-xs bg-green-500/15 text-green-300"
                                : "inline-flex px-3 py-1 rounded-full text-xs bg-red-500/15 text-red-300"
                            }
                          >
                            {m.isActive ? "نشط" : "موقوف"}
                          </span>
                        </div>
                        <div
                          className="flex items-center justify-end gap-2"
                          style={{ direction: "ltr" }}
                        >
                          <button
                            type="button"
                            onClick={() => setExpandedStaffId(isExpanded ? null : m.id)}
                            className="px-2 py-1 rounded-lg text-xs text-white/50 hover:text-white hover:bg-white/10 transition"
                            title="تفاصيل الراتب"
                          >
                            {isExpanded ? "▲" : "▼"}
                          </button>
                          {canManage && (
                            <>
                              <Button
                                variant="ghost"
                                size="xs"
                                onClick={() => openEditModal(m.id)}
                              >
                                تعديل
                              </Button>
                              <Button
                                variant="danger"
                                size="xs"
                                onClick={() => removeStaff(m.id)}
                              >
                                حذف
                              </Button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Salary breakdown panel */}
                      {isExpanded && breakdown && (
                        <div className={`${zebra} px-6 pb-4 border-t border-white/5`}>
                          <div className="mt-3 rounded-xl bg-black/20 border border-white/10 p-4">
                            <div className="text-xs font-semibold text-white/60 mb-3">
                              تفاصيل الراتب — {currentMonth}
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                              <div className="rounded-lg bg-white/5 px-3 py-2 text-center">
                                <div className="text-xs text-white/50">الراتب الأساسي</div>
                                <div className="text-sm font-semibold mt-0.5">{breakdown.baseSalary} د.ك</div>
                              </div>
                              <div className="rounded-lg bg-white/5 px-3 py-2 text-center">
                                <div className="text-xs text-white/50">حصص الشهر</div>
                                <div className="text-sm font-semibold mt-0.5">{breakdown.sessionsInMonth}</div>
                              </div>
                              <div className="rounded-lg bg-white/5 px-3 py-2 text-center">
                                <div className="text-xs text-white/50">حضور مسجّل</div>
                                <div className="text-sm font-semibold text-emerald-400 mt-0.5">{breakdown.attended}</div>
                              </div>
                              <div className="rounded-lg bg-white/5 px-3 py-2 text-center">
                                <div className="text-xs text-white/50">غيابات (خصم)</div>
                                <div className="text-sm font-semibold text-red-400 mt-0.5">{breakdown.absences}</div>
                              </div>
                              <div className="rounded-lg bg-white/5 px-3 py-2 text-center">
                                <div className="text-xs text-white/50">صافي الراتب</div>
                                <div className={`text-sm font-bold mt-0.5 ${breakdown.totalDeduction > 0 ? "text-amber-300" : "text-emerald-300"}`}>
                                  {breakdown.netSalary} د.ك
                                  {breakdown.totalDeduction > 0 && (
                                    <span className="text-xs text-red-400 block">
                                      - {breakdown.totalDeduction} خصم
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            {breakdown.sessionsInMonth === 0 && (
                              <p className="text-xs text-white/40 mt-2">
                                لم يتم تسجيل جدول الفرع أو لا توجد حصص هذا الشهر.
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
            </div>{/* min-w */}
            </div>{/* hidden md:block */}
          </div>
        )}

        {/* Modal */}
        <Modal open={open} onClose={() => { setOpen(false); resetForm(); }}>
            <div className="w-full max-w-[760px] rounded-[28px] bg-[#111827] border border-white/10 shadow-2xl max-h-[92vh] overflow-y-auto">
              <div className="px-4 sm:px-8 pt-6 sm:pt-8 flex items-start justify-between">
                <div>
                  <h2 className="text-3xl font-semibold">
                    {editingId ? "تعديل موظف" : "إضافة موظف"}
                  </h2>
                  <p className="mt-2 text-white/60 text-sm">
                    أدخل البيانات وعيّن الموظف على فرع/فروع.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setOpen(false);
                    resetForm();
                  }}
                  className="h-10 w-10 rounded-xl bg-white/5 hover:bg-white/10 transition text-xl leading-none"
                  aria-label="إغلاق"
                  type="button"
                >
                  ×
                </button>
              </div>

              <div className="px-4 sm:px-8 py-4 sm:py-6 space-y-4">
                {/* Save error */}
                {saveError && (
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
                    {saveError}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* الاسم */}
                  <div>
                    <label className="block text-sm text-white/70 mb-2">
                      الاسم
                    </label>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full h-11 rounded-xl bg-[#0F172A] border border-white/10 px-4 text-white outline-none focus:border-white/25"
                      placeholder="مثال: أحمد صالح"
                    />
                  </div>

                  {/* الدور */}
                  <div>
                    <label className="block text-sm text-white/70 mb-2">
                      الدور
                    </label>
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value as StaffRole)}
                      className="w-full h-11 rounded-xl bg-[#0F172A] border border-white/10 px-4 text-white outline-none focus:border-white/25"
                    >
                      <option value="مدرب">مدرب</option>
                      <option value="إداري">إداري</option>
                      <option value="موظف">موظف</option>
                    </select>
                  </div>

                  {/* مسمى وظيفة */}
                  {role === "موظف" && (
                    <div className="md:col-span-2">
                      <label className="block text-sm text-white/70 mb-2">
                        مسمى الوظيفة (مثال: تسويق)
                      </label>
                      <input
                        value={jobTitle}
                        onChange={(e) => setJobTitle(e.target.value)}
                        className="w-full h-11 rounded-xl bg-[#0F172A] border border-white/10 px-4 text-white outline-none focus:border-white/25"
                        placeholder="مثال: تسويق"
                      />
                    </div>
                  )}

                  {/* الراتب */}
                  <div>
                    <label className="block text-sm text-white/70 mb-2">
                      الراتب الشهري (د.ك)
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={monthlySalary === 0 ? "" : String(monthlySalary)}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^0-9]/g, "");
                        setMonthlySalary(v ? Number(v) : 0);
                      }}
                      className="w-full h-11 rounded-xl bg-[#0F172A] border border-white/10 px-4 text-white outline-none focus:border-white/25"
                      placeholder="مثال: 150"
                    />
                  </div>

                  {/* الحالة */}
                  <div>
                    <label className="block text-sm text-white/70 mb-2">
                      الحالة
                    </label>
                    <select
                      value={isActive ? "نشط" : "موقوف"}
                      onChange={(e) => setIsActive(e.target.value === "نشط")}
                      className="w-full h-11 rounded-xl bg-[#0F172A] border border-white/10 px-4 text-white outline-none focus:border-white/25"
                    >
                      <option value="نشط">نشط</option>
                      <option value="موقوف">موقوف</option>
                    </select>
                  </div>

                  {/* تعيين للفروع */}
                  <div className="md:col-span-2 rounded-xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <div className="font-semibold">تعيين للفروع</div>
                        <div className="text-xs text-white/60 mt-1">
                          فرع واحد / أكثر من فرع / جميع الفروع
                        </div>
                      </div>
                      <select
                        value={assignMode}
                        onChange={(e) =>
                          setAssignMode(e.target.value as AssignMode)
                        }
                        className="h-11 rounded-xl bg-[#0F172A] border border-white/10 px-4 text-white outline-none focus:border-white/25"
                      >
                        <option value="single">فرع واحد</option>
                        <option value="multi">أكثر من فرع</option>
                        <option value="all">جميع الفروع</option>
                      </select>
                    </div>

                    <div className="mt-4">
                      {assignMode === "single" && (
                        <div>
                          <label className="block text-sm text-white/70 mb-2">
                            اختر الفرع
                          </label>
                          <select
                            value={singleBranchId}
                            onChange={(e) => setSingleBranchId(e.target.value)}
                            className="w-full h-11 rounded-xl bg-[#0F172A] border border-white/10 px-4 text-white outline-none focus:border-white/25"
                          >
                            {branches.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {assignMode === "all" && (
                        <div className="text-sm text-white/80">
                          سيتم تعيين الموظف على{" "}
                          <span className="font-semibold">جميع الفروع</span>.
                        </div>
                      )}

                      {assignMode === "multi" && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {branches.map((b) => (
                            <label
                              key={b.id}
                              className="flex items-center gap-3 rounded-xl bg-black/20 border border-white/10 p-3 cursor-pointer hover:bg-black/25"
                            >
                              <input
                                type="checkbox"
                                checked={!!multiBranchIds[b.id]}
                                onChange={() => toggleMultiBranch(b.id)}
                                className="h-4 w-4"
                              />
                              <span className="text-sm font-semibold">
                                {b.name}
                              </span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="px-4 sm:px-8 pb-6 sm:pb-8 flex items-center justify-start gap-3">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setOpen(false);
                    resetForm();
                  }}
                >
                  إلغاء
                </Button>
                <Button
                  onClick={saveStaff}
                  disabled={branches.length === 0 || saving}
                >
                  {saving
                    ? "جاري الحفظ..."
                    : editingId
                    ? "حفظ التعديل"
                    : "إضافة"}
                </Button>
              </div>
            </div>
        </Modal>
      </main>
  );
}
