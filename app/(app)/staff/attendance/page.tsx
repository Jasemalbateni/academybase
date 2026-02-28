"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { listStaff, type DbStaff } from "@/src/lib/supabase/staff";
import { listBranches, type DbBranch } from "@/src/lib/supabase/branches";
import {
  listStaffAttendance,
  upsertStaffAttendance,
  deleteStaffAttendance,
  bulkUpsertStaffAttendance,
  computeSessionDeduction,
  ATTENDANCE_STATUS_LABELS,
  type AttendanceStatus,
} from "@/src/lib/supabase/staff-attendance";
import {
  upsertStaffSubstitute,
  listStaffSubstitutes,
  type DbStaffSubstitute,
} from "@/src/lib/supabase/staff-substitutes";
import { upsertAutoFinanceTx } from "@/src/lib/supabase/finance";

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

// ── Arabic / Date helpers ─────────────────────────────────────────────────────

const ARABIC_TO_JS_DAY: Record<string, number> = {
  "الأحد": 0, "الاثنين": 1, "الثلاثاء": 2,
  "الأربعاء": 3, "الخميس": 4, "الجمعة": 5, "السبت": 6,
};

const JS_DAY_TO_SHORT: Record<number, string> = {
  0: "أحد", 1: "اثن", 2: "ثلا", 3: "أرب", 4: "خمي", 5: "جمع", 6: "سبت",
};

const ARABIC_MONTHS: Record<string, string> = {
  "01": "يناير", "02": "فبراير", "03": "مارس",   "04": "أبريل",
  "05": "مايو",  "06": "يونيو",  "07": "يوليو",  "08": "أغسطس",
  "09": "سبتمبر","10": "أكتوبر","11": "نوفمبر", "12": "ديسمبر",
};

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function prevMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function nextMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  d.setMonth(d.getMonth() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  return `${ARABIC_MONTHS[m] ?? ym} ${y}`;
}

/** Local-timezone JS weekday (0=Sun ... 6=Sat) for an ISO date string. */
function jsDay(dateISO: string): number {
  const [y, m, d] = dateISO.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

/**
 * Returns all dates in `month` (YYYY-MM) that have at least one branch
 * training session, mapped to the active branches for each date.
 */
function buildSessionDateMap(
  month:    string,
  branches: DbBranch[]
): Map<string, DbBranch[]> {
  const [y, m]  = month.split("-").map(Number);
  const days    = new Date(y, m, 0).getDate();
  const map     = new Map<string, DbBranch[]>();

  for (let d = 1; d <= days; d++) {
    const dateISO = `${month}-${String(d).padStart(2, "0")}`;
    const jd      = new Date(y, m - 1, d).getDay();
    const active  = branches.filter((b) =>
      (b.days ?? []).some((day) => ARABIC_TO_JS_DAY[day] === jd)
    );
    if (active.length > 0) map.set(dateISO, active);
  }

  return map;
}

// ── Status helpers ────────────────────────────────────────────────────────────

const STATUS_OPTIONS: AttendanceStatus[] = [
  "present", "late", "absent", "vacation", "excused",
];

function statusColor(s: AttendanceStatus): string {
  switch (s) {
    case "present":  return "bg-emerald-400/15 text-emerald-300 border-emerald-400/25";
    case "late":     return "bg-amber-400/15 text-amber-300 border-amber-400/25";
    case "absent":   return "bg-red-500/15 text-red-300 border-red-500/25";
    case "vacation": return "bg-blue-400/15 text-blue-300 border-blue-400/25";
    case "excused":  return "bg-purple-400/15 text-purple-300 border-purple-400/25";
  }
}

function statusLabel(s: AttendanceStatus): string {
  return ATTENDANCE_STATUS_LABELS[s] ?? s;
}

// ── Row state ─────────────────────────────────────────────────────────────────
// Keyed by `{staffId}:{branchId}` — one entry per (staff, branch) slot.

type RowState = {
  status:             AttendanceStatus;
  deductFromSalary:   boolean;
  deductionAmount:    number;
  notes:              string;
  saving:             boolean;
  savedId:            string | null;
  hasFinanceEntry:    boolean;
};

function defaultRow(): RowState {
  return {
    status:           "present",
    deductFromSalary: false,
    deductionAmount:  0,
    notes:            "",
    saving:           false,
    savedId:          null,
    hasFinanceEntry:  false,
  };
}

function rowKey(staffId: string, branchId: string): string {
  return `${staffId}:${branchId}`;
}

// ── Slot: one (staff, branch) pair active on a given day ─────────────────────

type AttendanceSlot = { staff: DbStaff; branch: DbBranch };

/**
 * Returns all (staff, branch) pairs that should have attendance tracked on
 * `dateISO`. Deduplicates by composite key so each pair appears exactly once.
 */
function buildSlots(
  dateISO:  string,
  branches: DbBranch[],
  staff:    DbStaff[]
): AttendanceSlot[] {
  const jd            = jsDay(dateISO);
  const activeBranches = branches.filter((b) =>
    (b.days ?? []).some((day) => ARABIC_TO_JS_DAY[day] === jd)
  );

  const seen  = new Set<string>();
  const slots: AttendanceSlot[] = [];

  for (const branch of activeBranches) {
    for (const s of staff) {
      if (!s.is_active) continue;
      const inBranch =
        s.assign_mode === "all" || (s.branch_ids ?? []).includes(branch.id);
      if (!inBranch) continue;

      const k = rowKey(s.id, branch.id);
      if (seen.has(k)) continue;
      seen.add(k);
      slots.push({ staff: s, branch });
    }
  }

  return slots;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function StaffAttendancePage() {
  const today = todayISO();

  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey());
  const [selectedDate,  setSelectedDate]  = useState<string | null>(null);

  const [branches, setBranches] = useState<DbBranch[]>([]);
  const [staff,    setStaff]    = useState<DbStaff[]>([]);

  const [loading,    setLoading]    = useState(true);
  const [pageError,  setPageError]  = useState<string | null>(null);
  const [attError,   setAttError]   = useState<string | null>(null); // attendance-load error
  const [saveError,  setSaveError]  = useState<string | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);

  // Row state: "{staffId}:{branchId}" → RowState
  const [rows, setRows] = useState<Map<string, RowState>>(new Map());

  // Feature E: Substitute coach state
  const [substitutes, setSubstitutes] = useState<Map<string, DbStaffSubstitute>>(new Map());
  const [subModal, setSubModal] = useState<{ staffId: string; branchId: string } | null>(null);
  const [subType, setSubType] = useState<"staff" | "external">("external");
  const [subStaffId, setSubStaffId] = useState<string>("");
  const [subName, setSubName] = useState<string>("");
  const [subAmount, setSubAmount] = useState<number>(0);
  const [subNote, setSubNote] = useState<string>("");
  const [subSaving, setSubSaving] = useState(false);

  // ── Load branches + staff ─────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    setPageError(null);
    try {
      const [dbBranches, dbStaff] = await Promise.all([
        listBranches(),
        listStaff(),
      ]);
      setBranches(dbBranches);
      setStaff(dbStaff);
    } catch (e) {
      setPageError(formatError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-select today if it falls on a session day
  useEffect(() => {
    if (loading || branches.length === 0 || selectedDate !== null) return;
    const jd           = new Date().getDay();
    const todaySession = branches.some((b) =>
      (b.days ?? []).some((day) => ARABIC_TO_JS_DAY[day] === jd)
    );
    if (todaySession) setSelectedDate(today);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, branches]);

  // ── Load attendance when date changes ─────────────────────────────────────

  useEffect(() => {
    // Always clear rows + substitutes on date change (including to null)
    setRows(new Map());
    setSubstitutes(new Map());
    setAttError(null);
    if (!selectedDate) return;

    let cancelled = false;

    // Load substitutes for the new date (best-effort)
    listStaffSubstitutes(selectedDate)
      .then((subs) => {
        if (cancelled) return;
        const subMap = new Map<string, DbStaffSubstitute>();
        for (const s of subs) subMap.set(rowKey(s.staff_id, s.branch_id), s);
        setSubstitutes(subMap);
      })
      .catch(() => {}); // graceful — table may not exist yet

    listStaffAttendance(selectedDate)
      .then((records) => {
        if (cancelled) return;
        const next = new Map<string, RowState>();
        for (const r of records) {
          next.set(rowKey(r.staff_id, r.branch_id), {
            status:           r.status,
            deductFromSalary: r.deduct_from_salary,
            deductionAmount:  Number(r.deduction_amount),
            notes:            r.notes ?? "",
            saving:           false,
            savedId:          r.id,
            hasFinanceEntry:
              r.deduct_from_salary &&
              r.status !== "present" &&
              Number(r.deduction_amount) > 0,
          });
        }
        setRows(next);
      })
      .catch((e) => {
        if (cancelled) return;
        const msg = formatError(e);
        console.error("[staff-attendance] attendance load error:", e);
        // Surface PGRST205 (missing table) as a clear actionable message
        if (msg.includes("PGRST205") || msg.includes("schema cache") || msg.includes("staff_attendance")) {
          setAttError(
            "جدول حضور الطاقم غير موجود في قاعدة البيانات. " +
            "يرجى تشغيل ملف الترحيل: supabase/19_schema_staff_attendance.sql في Supabase SQL Editor."
          );
        } else {
          setAttError(msg);
        }
      });

    return () => { cancelled = true; };
  }, [selectedDate]);

  // ── Session date map ───────────────────────────────────────────────────────

  const sessionDateMap = useMemo(
    () => buildSessionDateMap(selectedMonth, branches),
    [selectedMonth, branches]
  );

  const sessionDates = useMemo(
    () => Array.from(sessionDateMap.keys()).sort(),
    [sessionDateMap]
  );

  // ── Slots for selected date ────────────────────────────────────────────────

  const slots = useMemo(
    () => (selectedDate ? buildSlots(selectedDate, branches, staff) : []),
    [selectedDate, branches, staff]
  );

  // ── Session value per slot ────────────────────────────────────────────────

  const sessionValueMap = useMemo(() => {
    if (!selectedDate) return new Map<string, number>();
    const [y, m] = selectedDate.split("-").map(Number);
    return new Map(
      slots.map(({ staff: s, branch: b }) => [
        rowKey(s.id, b.id),
        computeSessionDeduction(Number(s.monthly_salary), y, m, b.days ?? []),
      ])
    );
  }, [slots, selectedDate]);

  // ── Row update ────────────────────────────────────────────────────────────

  function updateRow(key: string, patch: Partial<RowState>) {
    setRows((prev) =>
      new Map(prev).set(key, { ...(prev.get(key) ?? defaultRow()), ...patch })
    );
  }

  function handleStatusChange(key: string, status: AttendanceStatus) {
    const row        = rows.get(key) ?? defaultRow();
    const sessionVal = sessionValueMap.get(key) ?? 0;
    const deductFromSalary = status === "present" ? false : row.deductFromSalary;
    const deductionAmount  =
      status === "present"
        ? 0
        : deductFromSalary
          ? (row.deductionAmount > 0 ? row.deductionAmount : sessionVal)
          : 0;
    updateRow(key, { status, deductFromSalary, deductionAmount });
  }

  function handleDeductToggle(key: string, checked: boolean) {
    const row        = rows.get(key) ?? defaultRow();
    const sessionVal = sessionValueMap.get(key) ?? 0;
    updateRow(key, {
      deductFromSalary: checked,
      deductionAmount:  checked
        ? (row.deductionAmount > 0 ? row.deductionAmount : sessionVal)
        : 0,
    });
  }

  // ── Save single slot ──────────────────────────────────────────────────────

  // Feature E: open substitute modal
  function openSubModal(staffId: string, branchId: string) {
    const key = rowKey(staffId, branchId);
    const existing = substitutes.get(key);
    setSubModal({ staffId, branchId });
    setSubType(existing?.substitute_staff_id ? "staff" : "external");
    setSubStaffId(existing?.substitute_staff_id ?? "");
    setSubName(existing?.substitute_name ?? "");
    setSubAmount(existing ? Number(existing.payment_amount) : 0);
    setSubNote(existing?.note ?? "");
  }

  // Feature E: save substitute
  async function saveSubstitute() {
    if (!subModal || !selectedDate) return;
    const resolvedName =
      subType === "staff"
        ? (staff.find((s) => s.id === subStaffId)?.name ?? subName)
        : subName;
    if (!resolvedName.trim()) {
      setSaveError("أدخل اسم البديل أو اختر موظفاً من القائمة.");
      return;
    }

    setSubSaving(true);
    setSaveError(null);
    try {
      const month = selectedDate.slice(0, 7);
      const absentStaff = staff.find((s) => s.id === subModal.staffId);
      const subBranch   = branches.find((b) => b.id === subModal.branchId);

      const saved = await upsertStaffSubstitute({
        staff_id:            subModal.staffId,
        branch_id:           subModal.branchId,
        date:                selectedDate,
        substitute_staff_id: subType === "staff" && subStaffId ? subStaffId : null,
        substitute_name:     resolvedName.trim(),
        payment_amount:      subAmount,
        note:                subNote.trim() || null,
      });

      // Auto-create finance expense (best-effort)
      if (subAmount > 0) {
        try {
          // For existing staff substitutes: use sub_income: auto_key so finance page
          // groups it as a positive sub-item under that staff member's salary row.
          // For external substitutes: keep separate expense row.
          const isStaffSub = subType === "staff" && !!subStaffId;
          const autoKey = isStaffSub
            ? `sub_income:${month}:${subStaffId}:${subModal.branchId}:${selectedDate}`
            : `substitute:${month}:${subModal.staffId}:${subModal.branchId}:${selectedDate}`;
          await upsertAutoFinanceTx({
            month,
            date:     selectedDate,
            type:     "مصروف",
            branch_id: subModal.branchId,
            category: "رواتب",
            amount:   subAmount,
            note:     `بديل: ${resolvedName.trim()} عن ${absentStaff?.name ?? ""} — ${subBranch?.name ?? ""}`,
            source:   "auto",
            auto_key: autoKey,
          });
        } catch { /* non-critical */ }
      }

      setSubstitutes((prev) =>
        new Map(prev).set(rowKey(saved.staff_id, saved.branch_id), saved)
      );
      setSubModal(null);
    } catch (e) {
      setSaveError(formatError(e));
    } finally {
      setSubSaving(false);
    }
  }

  async function saveSlot(staffId: string, branchId: string) {
    if (!selectedDate) return;
    const key = rowKey(staffId, branchId);
    const row = rows.get(key) ?? defaultRow();

    // Feature A: validate deduction amount
    if (row.deductFromSalary && row.deductionAmount < 0) {
      setSaveError("مبلغ الخصم لا يمكن أن يكون سالباً");
      return;
    }

    updateRow(key, { saving: true });
    setSaveError(null);
    try {
      const willDeduct = row.deductFromSalary && row.status !== "present";
      const saved = await upsertStaffAttendance({
        staff_id:           staffId,
        branch_id:          branchId,
        date:               selectedDate,
        status:             row.status,
        deduct_from_salary: willDeduct,
        deduction_amount:   willDeduct ? row.deductionAmount : 0,
        notes:              row.notes.trim() || null,
      });
      updateRow(key, {
        saving:          false,
        savedId:         saved.id,
        hasFinanceEntry:
          saved.deduct_from_salary &&
          saved.status !== "present" &&
          Number(saved.deduction_amount) > 0,
      });
    } catch (e) {
      updateRow(key, { saving: false });
      setSaveError(formatError(e));
    }
  }

  // ── Delete single slot ────────────────────────────────────────────────────

  async function deleteSlot(staffId: string, branchId: string) {
    const key = rowKey(staffId, branchId);
    const row = rows.get(key);
    if (!row?.savedId) return;
    updateRow(key, { saving: true });
    try {
      await deleteStaffAttendance(row.savedId);
      updateRow(key, { ...defaultRow(), saving: false });
    } catch (e) {
      updateRow(key, { saving: false });
      setSaveError(formatError(e));
    }
  }

  // ── Bulk: Mark All Present ────────────────────────────────────────────────

  async function markAllPresent() {
    if (!selectedDate || slots.length === 0) return;
    const date = selectedDate;
    setBulkSaving(true);
    setSaveError(null);
    try {
      const records = slots.map(({ staff: s, branch: b }) => ({
        staff_id:           s.id,
        branch_id:          b.id,
        date,
        status:             "present" as AttendanceStatus,
        deduct_from_salary: false,
        deduction_amount:   0,
        notes:              null,
      }));
      const saved = await bulkUpsertStaffAttendance(records);
      setRows((prev) => {
        const next = new Map(prev);
        for (const r of saved) {
          next.set(rowKey(r.staff_id, r.branch_id), {
            status:           "present",
            deductFromSalary: false,
            deductionAmount:  0,
            notes:            "",
            saving:           false,
            savedId:          r.id,
            hasFinanceEntry:  false,
          });
        }
        return next;
      });
    } catch (e) {
      setSaveError(formatError(e));
    } finally {
      setBulkSaving(false);
    }
  }

  // ── Derived summary ───────────────────────────────────────────────────────

  const totalDeductions = useMemo(
    () =>
      slots.reduce((sum, { staff: s, branch: b }) => {
        const r = rows.get(rowKey(s.id, b.id)) ?? defaultRow();
        return (
          sum +
          (r.deductFromSalary && r.status !== "present" ? r.deductionAmount : 0)
        );
      }, 0),
    [slots, rows]
  );

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <main className="flex-1 p-6" dir="rtl">
        <div className="flex items-center justify-center h-48 text-white/40 text-sm">
          جاري التحميل...
        </div>
      </main>
    );
  }

  if (pageError) {
    return (
      <main className="flex-1 p-6" dir="rtl">
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          {pageError}
          <button
            onClick={loadData}
            className="mr-3 underline text-red-200 hover:text-white transition"
          >
            إعادة المحاولة
          </button>
        </div>
      </main>
    );
  }

  const selectedDateBranches = selectedDate
    ? (sessionDateMap.get(selectedDate) ?? [])
    : [];

  return (
    <main className="flex-1 p-6" dir="rtl">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-white">حضور الطاقم</h1>
        <p className="text-sm text-white/50 mt-0.5">
          تسجيل حضور أعضاء الطاقم وخصومات الرواتب
        </p>
      </div>

      {/* ── Save error ─────────────────────────────────────────────────────── */}
      {saveError && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300 flex items-start justify-between gap-2">
          <span>{saveError}</span>
          <button
            onClick={() => setSaveError(null)}
            className="shrink-0 text-red-200 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Month navigation + Date tiles ──────────────────────────────────── */}
      <div className="mb-6 rounded-2xl border border-white/10 bg-[#111827] p-5">

        {/* Month header */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => {
              setSelectedMonth(prevMonth(selectedMonth));
              setSelectedDate(null);
            }}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white transition text-xl leading-none"
          >
            ›
          </button>
          <h2 className="text-sm font-semibold text-white/80">
            {monthLabel(selectedMonth)}
          </h2>
          <button
            onClick={() => {
              setSelectedMonth(nextMonth(selectedMonth));
              setSelectedDate(null);
            }}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white transition text-xl leading-none"
          >
            ‹
          </button>
        </div>

        {/* Session date tiles */}
        {sessionDates.length === 0 ? (
          <div className="py-5 text-center text-sm text-white/30">
            لا توجد جلسات مجدولة هذا الشهر — تحقق من إعداد أيام التمرين في الفروع
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {sessionDates.map((date) => {
              const dayNum        = Number(date.slice(8, 10));
              const jd            = jsDay(date);
              const shortDay      = JS_DAY_TO_SHORT[jd] ?? "";
              const isSelected    = date === selectedDate;
              const isToday       = date === today;
              const activeBranches = sessionDateMap.get(date) ?? [];

              return (
                <button
                  key={date}
                  type="button"
                  onClick={() => setSelectedDate(isSelected ? null : date)}
                  title={activeBranches.map((b) => b.name).join("، ")}
                  className={[
                    "flex flex-col items-center justify-center w-[52px] h-[62px] rounded-xl border text-xs font-medium transition select-none",
                    isSelected
                      ? "bg-[#63C0B0]/25 border-[#63C0B0]/70 text-[#63C0B0] shadow-sm"
                      : isToday
                        ? "bg-white/8 border-white/30 text-white hover:border-[#63C0B0]/50 hover:bg-[#63C0B0]/10"
                        : "bg-white/4 border-white/12 text-white/70 hover:border-white/25 hover:bg-white/8",
                  ].join(" ")}
                >
                  <span className="text-[15px] font-bold leading-none">{dayNum}</span>
                  <span className="text-[9px] mt-0.5 opacity-60">{shortDay}</span>
                  <div className="flex gap-0.5 mt-1.5">
                    {activeBranches.slice(0, 4).map((_, i) => (
                      <div
                        key={i}
                        className="w-[5px] h-[5px] rounded-full bg-current opacity-50"
                      />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── No date selected prompt ─────────────────────────────────────────── */}
      {!selectedDate && (
        <div className="rounded-2xl border border-dashed border-white/15 bg-white/3 px-6 py-12 text-center">
          <div className="text-4xl mb-3 opacity-20 select-none">📅</div>
          <p className="text-sm text-white/40">
            اختر يوماً من التقويم أعلاه لعرض قائمة الحضور
          </p>
        </div>
      )}

      {/* ── Selected date view ─────────────────────────────────────────────── */}
      {selectedDate && (
        <>
          {/* Date title + branch tags + bulk button */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-white">
              {Number(selectedDate.slice(8, 10))}/{Number(selectedDate.slice(5, 7))}/{selectedDate.slice(0, 4)}
              {" — "}
              {JS_DAY_TO_SHORT[jsDay(selectedDate)] ?? ""}
            </span>
            {selectedDateBranches.map((b) => (
              <span
                key={b.id}
                className="text-[11px] rounded-full bg-white/8 border border-white/15 px-2.5 py-0.5 text-white/55"
              >
                {b.name}
              </span>
            ))}
            {slots.length > 0 && (
              <button
                onClick={markAllPresent}
                disabled={bulkSaving}
                className="flex items-center gap-1.5 rounded-xl bg-emerald-500/15 border border-emerald-400/25 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {bulkSaving ? "جاري التسجيل..." : "✓ حضور الجميع"}
              </button>
            )}
            {totalDeductions > 0 && (
              <span className="text-[11px] rounded-full bg-red-500/10 border border-red-500/20 px-2.5 py-0.5 text-red-300">
                خصومات: {totalDeductions.toLocaleString("ar-SA")} د.ك
              </span>
            )}
          </div>

          {/* Attendance load error */}
          {attError && (
            <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-300">
              <div className="font-semibold mb-1">خطأ في تحميل سجلات الحضور</div>
              <div className="text-xs text-amber-200/80">{attError}</div>
              <button
                onClick={() => {
                  setAttError(null);
                  setSelectedDate(null);
                  setTimeout(() => setSelectedDate(selectedDate), 50);
                }}
                className="mt-2 text-xs underline text-amber-200 hover:text-white transition"
              >
                إعادة المحاولة
              </button>
            </div>
          )}

          {/* Empty state */}
          {slots.length === 0 && !attError && (
            <div className="rounded-xl border border-white/10 bg-white/5 py-10 text-center text-sm text-white/40">
              لا يوجد طاقم مخصص لهذا اليوم
            </div>
          )}

          {/* Staff grid — 2 / 3 / 4 compact columns */}
          {slots.length > 0 && !attError && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {slots.map(({ staff: member, branch }) => {
                const key        = rowKey(member.id, branch.id);
                const row        = rows.get(key) ?? defaultRow();
                const sessionVal = sessionValueMap.get(key) ?? 0;
                const canDeduct  = row.status !== "present";

                return (
                  <div
                    key={key}
                    className="rounded-2xl border border-white/10 bg-[#111827] p-3 flex flex-col items-center gap-2 hover:border-white/15 transition"
                  >
                    {/* Identity */}
                    <div className="w-full text-center">
                      <div className="flex items-start justify-center gap-2 mb-1">
                        <span className="font-semibold text-white text-sm leading-tight">
                          {member.name}
                        </span>
                        {row.hasFinanceEntry && (
                          <span className="shrink-0 rounded-full bg-amber-400/15 border border-amber-400/25 px-1.5 py-0.5 text-[9px] text-amber-300 whitespace-nowrap">
                            💰 خصم
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] text-white/50 leading-snug">
                        {member.role}
                        {member.job_title ? ` · ${member.job_title}` : ""}
                      </div>

                      <div className="mt-1.5 flex flex-wrap items-center justify-center gap-1.5">
                        <span className="text-[10px] rounded-full bg-white/6 border border-white/10 px-2 py-0.5 text-white/45">
                          {branch.name}
                        </span>
                        {sessionVal > 0 && (
                          <span className="text-[10px] text-white/30">
                            {sessionVal.toLocaleString("ar-SA")} د.ك/جلسة
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Status selector */}
                    <div className="flex items-center justify-center gap-2">
                      <select
                        value={row.status}
                        onChange={(e) =>
                          handleStatusChange(key, e.target.value as AttendanceStatus)
                        }
                        disabled={row.saving}
                        className="w-auto min-w-[110px] h-8 rounded-xl bg-[#0F172A] border border-white/10 px-2.5 text-xs text-white outline-none focus:border-white/25"
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {statusLabel(s)}
                          </option>
                        ))}
                      </select>
                      <span
                        className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-medium ${statusColor(row.status)}`}
                      >
                        {statusLabel(row.status)}
                      </span>
                    </div>

                    {/* Deduction panel */}
                    {canDeduct && (
                      <div className="w-full rounded-xl bg-white/4 border border-white/8 p-3 space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={row.deductFromSalary}
                            onChange={(e) =>
                              handleDeductToggle(key, e.target.checked)
                            }
                            disabled={row.saving}
                            className="w-3.5 h-3.5 rounded accent-emerald-500"
                          />
                          <span className="text-xs text-white/60">خصم من الراتب</span>
                        </label>

                        {row.deductFromSalary && (
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-white/40 shrink-0">
                              المبلغ (د.ك)
                            </span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={row.deductionAmount}
                              onChange={(e) =>
                                updateRow(key, {
                                  deductionAmount: parseFloat(e.target.value) || 0,
                                })
                              }
                              disabled={row.saving}
                              className="flex-1 min-w-0 rounded-lg bg-white/5 border border-white/15 px-2 py-1.5 text-xs text-white outline-none focus:border-emerald-400/50"
                            />
                          </div>
                        )}

                        {row.deductFromSalary && sessionVal === 0 && (
                          <p className="text-[10px] text-amber-300">
                            ⚠ أدخل المبلغ يدوياً — لم تُحدد أيام تمرين كافية
                          </p>
                        )}
                      </div>
                    )}

                    {/* Notes */}
                    <input
                      type="text"
                      placeholder="ملاحظة (اختياري)..."
                      value={row.notes}
                      onChange={(e) => updateRow(key, { notes: e.target.value })}
                      disabled={row.saving}
                      className="w-full rounded-xl bg-white/5 border border-white/12 px-3 py-2 text-[11px] text-white placeholder-white/20 outline-none focus:border-emerald-400/50"
                    />

                    {/* Feature E: Substitute coach button */}
                    {(row.status === "absent" || row.status === "vacation") && (
                      <div className="w-full">
                        {substitutes.has(key) ? (
                          <div className="flex items-center gap-2 rounded-xl bg-blue-500/10 border border-blue-400/20 px-3 py-2 text-xs">
                            <span className="text-blue-300 font-medium truncate flex-1">
                              👤 {substitutes.get(key)!.substitute_name}
                            </span>
                            {Number(substitutes.get(key)!.payment_amount) > 0 && (
                              <span className="shrink-0 text-blue-200/60">
                                {Number(substitutes.get(key)!.payment_amount).toFixed(3)} د.ك
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => openSubModal(member.id, branch.id)}
                              className="shrink-0 text-[10px] text-blue-300/60 hover:text-blue-300"
                            >
                              تعديل
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openSubModal(member.id, branch.id)}
                            className="w-full rounded-xl bg-blue-500/10 border border-blue-400/20 px-3 py-2 text-[11px] text-blue-300 hover:bg-blue-500/20 transition"
                          >
                            + تعيين بديل
                          </button>
                        )}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => saveSlot(member.id, branch.id)}
                        disabled={row.saving}
                        className="rounded-xl bg-emerald-500/20 border border-emerald-400/30 px-4 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/30 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {row.saving ? "..." : row.savedId ? "تحديث" : "حفظ"}
                      </button>
                      {row.savedId && (
                        <button
                          onClick={() => deleteSlot(member.id, branch.id)}
                          disabled={row.saving}
                          className="rounded-xl bg-red-500/10 border border-red-500/20 px-3 py-1.5 text-[10px] text-red-300 hover:bg-red-500/20 transition disabled:opacity-50"
                        >
                          حذف
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Day summary bar */}
          {slots.length > 0 && !attError && (
            <div className="mt-5 rounded-2xl border border-white/10 bg-white/3 p-4">
              <div className="text-xs text-white/45 mb-2">ملخص اليوم</div>
              <div className="flex flex-wrap gap-2">
                {STATUS_OPTIONS.map((s) => {
                  const count = slots.filter(
                    ({ staff: m, branch: b }) =>
                      (rows.get(rowKey(m.id, b.id)) ?? defaultRow()).status === s
                  ).length;
                  if (!count) return null;
                  return (
                    <span
                      key={s}
                      className={`rounded-full border px-2.5 py-1 text-[11px] ${statusColor(s)}`}
                    >
                      {count} {statusLabel(s)}
                    </span>
                  );
                })}
                {totalDeductions > 0 && (
                  <span className="rounded-full border border-red-500/25 bg-red-500/10 px-2.5 py-1 text-[11px] text-red-300">
                    إجمالي الخصومات: {totalDeductions.toLocaleString("ar-SA")} د.ك
                  </span>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Feature E: Substitute modal ───────────────────────────────────── */}
      {subModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm bg-[#111827] border border-white/10 rounded-2xl p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-sm">تعيين بديل</h3>
              <button
                type="button"
                onClick={() => { setSubModal(null); setSaveError(null); }}
                className="text-white/60 hover:text-white text-xl leading-none"
              >
                ✕
              </button>
            </div>

            {/* Save error */}
            {saveError && (
              <div className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {saveError}
              </div>
            )}

            {/* Type toggle */}
            <div className="flex gap-2 mb-4">
              {(["staff", "external"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setSubType(t); setSubStaffId(""); setSubName(""); }}
                  className={[
                    "flex-1 h-9 rounded-xl text-xs border transition",
                    subType === t
                      ? "bg-white/10 border-white/20 text-white"
                      : "bg-[#0F172A] border-white/10 text-white/60 hover:bg-white/5",
                  ].join(" ")}
                >
                  {t === "staff" ? "من الكادر" : "خارجي"}
                </button>
              ))}
            </div>

            {subType === "staff" ? (
              <div className="mb-3">
                <div className="text-xs text-white/60 mb-1">الموظف البديل</div>
                <select
                  value={subStaffId}
                  onChange={(e) => setSubStaffId(e.target.value)}
                  className="w-full h-10 rounded-xl bg-[#0F172A] border border-white/10 px-3 text-sm text-white outline-none"
                >
                  <option value="">اختر موظفاً</option>
                  {staff.filter((s) => s.id !== subModal.staffId).map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="mb-3">
                <div className="text-xs text-white/60 mb-1">اسم البديل</div>
                <input
                  value={subName}
                  onChange={(e) => setSubName(e.target.value)}
                  className="w-full h-10 rounded-xl bg-[#0F172A] border border-white/10 px-3 text-sm text-white outline-none focus:border-white/25"
                  placeholder="اسم المدرب البديل"
                />
              </div>
            )}

            <div className="mb-3">
              <div className="text-xs text-white/60 mb-1">المبلغ (د.ك)</div>
              <input
                type="number"
                min="0"
                step="0.001"
                value={subAmount === 0 ? "" : subAmount}
                onChange={(e) => setSubAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full h-10 rounded-xl bg-[#0F172A] border border-white/10 px-3 text-sm text-white outline-none focus:border-white/25"
                placeholder="0"
              />
            </div>

            <div className="mb-5">
              <div className="text-xs text-white/60 mb-1">ملاحظة (اختياري)</div>
              <input
                value={subNote}
                onChange={(e) => setSubNote(e.target.value)}
                className="w-full h-10 rounded-xl bg-[#0F172A] border border-white/10 px-3 text-sm text-white outline-none focus:border-white/25"
                placeholder="..."
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setSubModal(null); setSaveError(null); }}
                disabled={subSaving}
                className="flex-1 h-10 rounded-xl bg-white/5 border border-white/10 text-sm text-white/70 hover:bg-white/10 transition disabled:opacity-50"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={saveSubstitute}
                disabled={subSaving}
                className="flex-1 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/30 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/30 transition disabled:opacity-50"
              >
                {subSaving ? "جاري الحفظ..." : "حفظ"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
