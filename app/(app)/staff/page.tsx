"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/app/components/ui/Button";
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

// ── Error helper ──────────────────────────────────────────────────────────────
function formatError(e: unknown): string {
  if (!e) return "خطأ غير محدد";
  if (e instanceof Error) return e.message;
  if (typeof e === "object") {
    const pg = e as Record<string, unknown>;
    const parts: string[] = [];
    if (pg.message) parts.push(`message: ${pg.message}`);
    if (pg.code)    parts.push(`code: ${pg.code}`);
    if (pg.details) parts.push(`details: ${pg.details}`);
    if (pg.hint)    parts.push(`hint: ${pg.hint}`);
    if (parts.length) return parts.join(" | ");
    return JSON.stringify(e);
  }
  return String(e);
}

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

type BranchLite = { id: string; name: string };

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

// ── Page ──────────────────────────────────────────────────────────────────────
export default function StaffPage() {
  const [branches, setBranches] = useState<BranchLite[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);

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
      const [dbBranches, dbStaff] = await Promise.all([
        listBranches(),
        listStaff(),
      ]);
      const b: BranchLite[] = dbBranches.map((x: DbBranch) => ({
        id: x.id,
        name: x.name,
      }));
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
  }, []);

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
    if (!monthlySalary || monthlySalary <= 0)
      return "أدخل الراتب الشهري بشكل صحيح.";
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
    <main className="flex-1 p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold">الطاقم</h1>
            <p className="text-sm text-white/60 mt-1">
              إدارة رواتب الطاقم الشهرية وتعيينهم على الفروع.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-white/5 border border-white/10 px-4 py-3">
              <div className="text-xs text-white/60">إجمالي رواتب النشطين</div>
              <div className="text-lg font-bold">{totalActiveSalary} د.ك</div>
            </div>
            <Button onClick={openAddModal} disabled={loading}>
              + إضافة موظف
            </Button>
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

        {/* Loading */}
        {loading && (
          <div className="text-white/60 text-sm">جاري التحميل...</div>
        )}

        {/* No branches warning */}
        {!loading && !branches.length && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/70">
            لا توجد فروع. اذهب لصفحة الفروع وأضف فرعًا أولاً.
          </div>
        )}

        {/* Table */}
        {!loading && branches.length > 0 && (
          <div className="mt-6 bg-[#111827] rounded-2xl overflow-hidden border border-white/5">
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
                  const zebra =
                    idx % 2 === 0 ? "bg-[#0B1220]" : "bg-[#0E1A2B]";
                  return (
                    <div
                      key={m.id}
                      className={`${zebra} px-6 py-4 grid grid-cols-[1.6fr_1.2fr_1fr_1.8fr_0.9fr_1.2fr] gap-4 items-center`}
                    >
                      <div className="font-medium">{m.name}</div>
                      <div className="text-white/80">{roleLabel(m)}</div>
                      <div className="text-white/80">
                        {m.monthlySalary} د.ك
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
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Modal */}
        {open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-[760px] rounded-[28px] bg-[#111827] border border-white/10 shadow-2xl">
              <div className="px-8 pt-8 flex items-start justify-between">
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

              <div className="px-8 py-6 space-y-4">
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

              <div className="px-8 pb-8 flex items-center justify-start gap-3">
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
          </div>
        )}
      </main>
  );
}
