"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { listBranches,  type DbBranch   } from "@/src/lib/supabase/branches";
import { getUserRole,   type UserRole    } from "@/src/lib/supabase/roles";
import {
  listCalendarEvents,
  createCalendarEvent,
  deleteCalendarEvent,
  updateCalendarEvent,
  eventTypeLabel,
  eventTypeColor,
  type DbCalendarEvent,
  type CalendarEventType,
  type CalendarEventInsert,
} from "@/src/lib/supabase/calendar";
import {
  computeFieldCostPerSession,
  orchestrateCancelSession,
  orchestrateRestoreSession,
} from "@/src/lib/supabase/sessions";
import { listPlayers, updatePlayer, isPlayerActiveOnDate, type DbPlayer } from "@/src/lib/supabase/players";
import { listStaff, type DbStaff } from "@/src/lib/supabase/staff";

// ── Arabic weekday → JS getDay() ─────────────────────────────────────────────

const ARABIC_TO_JS_DAY: Record<string, number> = {
  "الأحد":    0,
  "الاثنين":  1,
  "الثلاثاء": 2,
  "الأربعاء": 3,
  "الخميس":   4,
  "الجمعة":   5,
  "السبت":    6,
};

// ── Generated training session (in-memory, NOT stored in DB) ─────────────────

type GeneratedSession = {
  date:       string; // ISO YYYY-MM-DD
  branchId:   string;
  branchName: string;
  startTime:  string;
  endTime:    string;
};

/**
 * Derives ALL training session dates for a given month from branch settings.
 * Zero DB writes — pure computation from branch.days[].
 */
function generateTrainingSessions(
  ym:       string,
  branches: DbBranch[]
): GeneratedSession[] {
  const [y, m] = ym.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const sessions: GeneratedSession[] = [];

  for (let d = 1; d <= lastDay; d++) {
    const dateISO = `${ym}-${String(d).padStart(2, "0")}`;
    const jsDay   = new Date(y, m - 1, d).getDay();

    for (const branch of branches) {
      const branchJsDays = (branch.days ?? [])
        .map((day) => ARABIC_TO_JS_DAY[day])
        .filter((n): n is number => n !== undefined);

      if (branchJsDays.includes(jsDay)) {
        sessions.push({
          date:       dateISO,
          branchId:   branch.id,
          branchName: branch.name,
          startTime:  branch.start_time ?? "",
          endTime:    branch.end_time   ?? "",
        });
      }
    }
  }

  return sessions;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Returns true only when the session has fully ended:
 *  - past date             → always true (end time has definitely passed)
 *  - future date           → always false (session hasn't happened yet)
 *  - today (same calendar date) → true only if current local time >= branch end_time
 *
 * This prevents deducting sessions mid-day when the session is still upcoming.
 * Falls back to "ended" when no end_time is configured for the branch.
 */
function sessionHasEnded(
  dateISO:  string,
  endTime:  string | null | undefined,
  todayStr: string,
): boolean {
  if (dateISO < todayStr) return true;
  if (dateISO > todayStr) return false;
  // Same calendar day: compare current local time with configured end time
  if (!endTime) return true; // no end time configured → assume session is over
  const [hh, mm] = endTime.split(":").map(Number);
  const endMinutes = (Number.isFinite(hh) ? hh : 0) * 60 + (Number.isFinite(mm) ? mm : 0);
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return nowMinutes >= endMinutes;
}

function monthKey(iso: string) {
  return iso.slice(0, 7);
}

function prevMonthKey(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function nextMonthKey(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  d.setMonth(d.getMonth() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function firstOfMonth(ym: string): string {
  return `${ym}-01`;
}

function lastOfMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
}

function buildCalendarGrid(ym: string): (string | null)[] {
  const [y, m]    = ym.split("-").map(Number);
  const startDay  = new Date(y, m - 1, 1).getDay();
  const totalDays = new Date(y, m, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) {
    cells.push(`${ym}-${String(d).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function formatTime(t: string): string {
  if (!t) return "";
  const [h, min] = t.split(":").map(Number);
  if (isNaN(h) || isNaN(min)) return t;
  const period = h >= 12 ? "م" : "ص";
  const h12    = h % 12 || 12;
  return `${h12}:${String(min).padStart(2, "0")}${period}`;
}

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const ARABIC_MONTHS: Record<string, string> = {
  "01": "يناير", "02": "فبراير", "03": "مارس",
  "04": "أبريل", "05": "مايو",   "06": "يونيو",
  "07": "يوليو", "08": "أغسطس",  "09": "سبتمبر",
  "10": "أكتوبر","11": "نوفمبر", "12": "ديسمبر",
};

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  return `${ARABIC_MONTHS[m] ?? ym} ${y}`;
}

const WEEKDAY_LABELS = [
  "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت",
];

// ── Branch color palette (consistent, hash-based) ────────────────────────────

const BRANCH_PALETTE = [
  "text-emerald-300 bg-emerald-400/10 border-emerald-400/20",
  "text-blue-300 bg-blue-400/10 border-blue-400/20",
  "text-amber-300 bg-amber-400/10 border-amber-400/20",
  "text-purple-300 bg-purple-400/10 border-purple-400/20",
  "text-rose-300 bg-rose-400/10 border-rose-400/20",
  "text-teal-300 bg-teal-400/10 border-teal-400/20",
  "text-cyan-300 bg-cyan-400/10 border-cyan-400/20",
  "text-orange-300 bg-orange-400/10 border-orange-400/20",
];

function getBranchColor(branchId: string): string {
  let h = 0;
  for (let i = 0; i < branchId.length; i++) h = ((h * 31) + branchId.charCodeAt(i)) & 0xffff;
  return BRANCH_PALETTE[h % BRANCH_PALETTE.length];
}

// ── Manual event form (match, special_event, and extra training sessions) ────

type ManualEventType = "match" | "special_event" | "training";

const MANUAL_EVENT_OPTIONS: { value: ManualEventType; label: string }[] = [
  { value: "training",      label: "تدريب إضافي" },
  { value: "match",         label: "مباراة" },
  { value: "special_event", label: "حدث خاص" },
];

type EventFormValues = {
  title:          string;
  date:           string;
  event_type:     ManualEventType;
  branch_id:      string;
  note:           string;
  deductSessions: boolean; // training only: create attendance records for active حصص players
};

function EventFormModal({
  initial,
  branches,
  onSave,
  onClose,
  saving,
}: {
  initial: EventFormValues;
  branches: DbBranch[];
  onSave: (v: EventFormValues) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<EventFormValues>(initial);
  const set = (field: keyof EventFormValues, value: string | boolean) =>
    setForm((f) => ({ ...f, [field]: value }));

  const isTraining = form.event_type === "training";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div
        className="w-full max-w-md rounded-2xl border border-white/15 bg-[#111827] shadow-2xl p-6"
        dir="rtl"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold">إضافة حدث</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-white/40 hover:text-white/80 transition text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-white/60 mb-1.5">نوع الحدث *</label>
            <select
              value={form.event_type}
              onChange={(e) => {
                const val = e.target.value as ManualEventType;
                const bName = branches.find((b) => b.id === form.branch_id)?.name ?? "";
                setForm((f) => ({
                  ...f,
                  event_type: val,
                  title: val === "training"
                    ? (bName ? `تدريب — ${bName}` : (f.title.trim() || "تدريب إضافي"))
                    : f.title,
                  deductSessions: val === "training" ? f.deductSessions : false,
                }));
              }}
              className="w-full rounded-xl bg-white/5 border border-white/15 px-4 py-2.5 text-sm text-white outline-none focus:border-emerald-400/50"
            >
              {MANUAL_EVENT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-white/60 mb-1.5">عنوان الحدث *</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder={isTraining ? "تدريب إضافي" : "مثال: مباراة نهائي الدوري"}
              className="w-full rounded-xl bg-white/5 border border-white/15 px-4 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-emerald-400/50"
            />
          </div>

          <div>
            <label className="block text-xs text-white/60 mb-1.5">التاريخ *</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => set("date", e.target.value)}
              className="w-full rounded-xl bg-white/5 border border-white/15 px-4 py-2.5 text-sm text-white outline-none focus:border-emerald-400/50"
            />
          </div>

          <div>
            <label className="block text-xs text-white/60 mb-1.5">الفرع{isTraining ? " *" : ""}</label>
            <select
              value={form.branch_id}
              onChange={(e) => {
                const newBid = e.target.value;
                const bName = branches.find((b) => b.id === newBid)?.name ?? "";
                setForm((f) => ({
                  ...f,
                  branch_id: newBid,
                  title: f.event_type === "training" && bName ? `تدريب — ${bName}` : f.title,
                }));
              }}
              className="w-full rounded-xl bg-white/5 border border-white/15 px-4 py-2.5 text-sm text-white outline-none focus:border-emerald-400/50"
            >
              {!isTraining && <option value="">كل الأكاديمية</option>}
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          {/* Training: session deduction toggle */}
          {isTraining && (
            <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-4 cursor-pointer hover:border-emerald-400/30 transition select-none">
              <input
                type="checkbox"
                checked={form.deductSessions}
                onChange={(e) => set("deductSessions", e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded accent-emerald-500 shrink-0"
              />
              <div>
                <div className="text-sm font-semibold text-white">احتساب حصة للاعبين النشطين</div>
                <div className="text-xs text-white/50 mt-0.5">
                  سيتم تسجيل حضور اللاعبين النشطين (نظام الحصص، غير مجمدين) في هذا الفرع تلقائياً
                </div>
              </div>
            </label>
          )}

          <div>
            <label className="block text-xs text-white/60 mb-1.5">ملاحظة</label>
            <textarea
              value={form.note}
              onChange={(e) => set("note", e.target.value)}
              rows={2}
              className="w-full rounded-xl bg-white/5 border border-white/15 px-4 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-emerald-400/50 resize-none"
            />
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => onSave(form)}
            disabled={saving || !form.title.trim() || !form.date || (isTraining && !form.branch_id)}
            className="flex-1 rounded-xl bg-emerald-500/20 border border-emerald-400/30 py-2.5 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/30 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "جاري الحفظ..." : "حفظ"}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-xl bg-white/5 border border-white/10 py-2.5 text-sm text-white/70 hover:bg-white/10 transition"
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Edit form for manual events ────────────────────────────────────────────────

function EditEventModal({
  event,
  branches,
  onSave,
  onDelete,
  onClose,
  saving,
}: {
  event: DbCalendarEvent;
  branches: DbBranch[];
  onSave: (id: string, payload: Partial<CalendarEventInsert>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [title, setTitle] = useState(event.title);
  const [note,  setNote]  = useState(event.note ?? "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        className="w-full max-w-md rounded-2xl border border-white/15 bg-[#111827] shadow-2xl p-6"
        dir="rtl"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold">تعديل الحدث</h2>
          <button type="button" onClick={onClose} className="text-white/40 hover:text-white/80 text-xl leading-none">×</button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-white/60 mb-1.5">العنوان</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-xl bg-white/5 border border-white/15 px-4 py-2.5 text-sm text-white outline-none focus:border-emerald-400/50"
            />
          </div>
          <div>
            <label className="block text-xs text-white/60 mb-1.5">ملاحظة</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full rounded-xl bg-white/5 border border-white/15 px-4 py-2.5 text-sm text-white outline-none focus:border-emerald-400/50 resize-none"
            />
          </div>
          <div className="text-xs text-white/40">
            التاريخ: {event.date.slice(8, 10)}/{event.date.slice(5, 7)} —{" "}
            {eventTypeLabel[event.event_type]}
            {event.branch_id
              ? ` — ${branches.find((b) => b.id === event.branch_id)?.name ?? ""}`
              : ""}
          </div>
        </div>

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={() => onSave(event.id, { title, note: note || null })}
            disabled={saving || !title.trim()}
            className="flex-1 rounded-xl bg-emerald-500/20 border border-emerald-400/30 py-2.5 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/30 transition disabled:opacity-50"
          >
            {saving ? "..." : "حفظ"}
          </button>
          <button
            type="button"
            onClick={() => onDelete(event.id)}
            disabled={saving}
            className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-2.5 text-sm text-red-300 hover:bg-red-500/20 transition disabled:opacity-50"
          >
            حذف
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white/70 hover:bg-white/10 transition"
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Cancel session dialog ─────────────────────────────────────────────────────

function CancelSessionDialog({
  branchName,
  date,
  sessionVal,
  isPerSession,
  affectedPlayersCount,
  affectedStaffCount,
  onConfirm,
  onDismiss,
}: {
  branchName:           string;
  date:                 string;
  sessionVal:           number;
  isPerSession:         boolean;
  affectedPlayersCount: number;
  affectedStaffCount:   number;
  onConfirm:    (removeFieldCost: boolean, deductCoach: boolean, extendPlayers: boolean) => void;
  onDismiss:    () => void;
}) {
  const [removeFieldCost, setRemoveFieldCost] = useState(false);
  const [deductCoach,     setDeductCoach]     = useState(false);
  const [extendPlayers,   setExtendPlayers]   = useState(false);

  const displayDate = `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#111827] shadow-2xl p-6"
        dir="rtl"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-white">إلغاء جلسة تدريب</h2>
          <button
            type="button"
            onClick={onDismiss}
            className="text-white/40 hover:text-white/80 transition text-xl leading-none"
          >
            ×
          </button>
        </div>

        <p className="text-sm text-white/60 mb-4">
          إلغاء جلسة{" "}
          <span className="font-semibold text-white">{branchName}</span>
          {" "}بتاريخ{" "}
          <span className="font-semibold text-white">{displayDate}</span>
        </p>

        {/* Impact preview */}
        <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 mb-4">
          <div className="text-xs font-semibold text-amber-300 mb-2">📊 معاينة التأثير</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-sky-400/10 flex items-center justify-center">
                <svg className="h-3.5 w-3.5 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div>
                <div className="text-lg font-bold text-white leading-none">{affectedPlayersCount}</div>
                <div className="text-[10px] text-white/45">لاعب نشط</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-amber-400/10 flex items-center justify-center">
                <svg className="h-3.5 w-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div>
                <div className="text-lg font-bold text-white leading-none">{affectedStaffCount}</div>
                <div className="text-[10px] text-white/45">مدرب مرتبط</div>
              </div>
            </div>
          </div>
          {isPerSession && sessionVal > 0 && (
            <div className="mt-2 text-[10px] text-white/40 border-t border-white/10 pt-2">
              تكلفة الملعب للجلسة: <span className="text-emerald-300 font-semibold">{sessionVal} د.ك</span>
            </div>
          )}
        </div>

        <div className="space-y-2">

          {/* Field cost checkbox — only for per_session branches */}
          {isPerSession && (
            <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-4 cursor-pointer hover:border-emerald-400/30 transition">
              <input
                type="checkbox"
                checked={removeFieldCost}
                onChange={(e) => setRemoveFieldCost(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded accent-emerald-500 shrink-0"
              />
              <div>
                <div className="text-sm font-semibold text-white">إزالة تكلفة الملعب</div>
                <div className="text-xs text-white/50 mt-0.5">
                  هذا الفرع محسوب بالحصة — تكلفة الجلسة الواحدة:{" "}
                  <span className="text-emerald-300 font-semibold">
                    {sessionVal > 0 ? `${sessionVal.toLocaleString("ar-SA")} د.ك` : "—"}
                  </span>
                </div>
                <div className="text-xs text-white/40 mt-1">
                  عند التأشير، تُسجَّل الجلسة بتكلفة صفر في التقارير المالية
                </div>
              </div>
            </label>
          )}

          {/* Coach salary deduction checkbox */}
          <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-4 cursor-pointer hover:border-amber-400/30 transition">
            <input
              type="checkbox"
              checked={deductCoach}
              onChange={(e) => setDeductCoach(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded accent-amber-500 shrink-0"
            />
            <div>
              <div className="text-sm font-semibold text-white">خصم راتب الجلسة من المدرب</div>
              <div className="text-xs text-white/50 mt-0.5">
                يُخصم مبلغ الجلسة الواحدة من رواتب المدربين المرتبطين بهذا الفرع
              </div>
              <div className="text-xs text-white/40 mt-1">
                يظهر كبند خصم تحت مصروف الرواتب في صفحة التمويل
              </div>
            </div>
          </label>

          {/* Extend players checkbox */}
          <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-4 cursor-pointer hover:border-sky-400/30 transition">
            <input
              type="checkbox"
              checked={extendPlayers}
              onChange={(e) => setExtendPlayers(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded accent-sky-500 shrink-0"
            />
            <div>
              <div className="text-sm font-semibold text-white">تمديد اللاعبين بحصة إضافية</div>
              <div className="text-xs text-white/50 mt-0.5">
                جميع اللاعبين المشتركين في هذا الفرع يحصلون على حصة إضافية تعويضاً
              </div>
              <div className="text-xs text-white/40 mt-1">
                اشتراك بالحصص: +1 حصة · اشتراك بالتاريخ: تمديد مدة مكافئة
              </div>
            </div>
          </label>

        </div>

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={() => onConfirm(removeFieldCost, deductCoach, extendPlayers)}
            className="flex-1 rounded-xl bg-red-500/20 border border-red-500/30 py-2.5 text-sm font-semibold text-red-300 hover:bg-red-500/30 transition"
          >
            تأكيد الإلغاء
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="flex-1 rounded-xl bg-white/5 border border-white/10 py-2.5 text-sm text-white/70 hover:bg-white/10 transition"
          >
            تراجع
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Training session badge ────────────────────────────────────────────────────

function TrainingBadge({
  session,
  canceled,
  canEdit,
  toggling,
  onToggle,
}: {
  session:  GeneratedSession;
  canceled: boolean;
  canEdit:  boolean;
  toggling: boolean;
  onToggle: (s: GeneratedSession) => void;
}) {
  const timeStr = session.startTime
    ? `${formatTime(session.startTime)}${session.endTime ? `–${formatTime(session.endTime)}` : ""}`
    : "";

  return (
    <div
      className={cn(
        "group flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[10px] leading-snug",
        "border transition",
        canceled
          ? "text-red-300 bg-red-500/10 border-red-500/20 line-through opacity-70"
          : getBranchColor(session.branchId)
      )}
      title={`${session.branchName}${timeStr ? ` — ${timeStr}` : ""}${canceled ? " (ملغي)" : ""}`}
    >
      <span className="truncate flex-1">
        {canceled ? "ملغي" : "تدريب"} — {session.branchName}
        {timeStr && <span className="opacity-70"> {timeStr}</span>}
      </span>

      {canEdit && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle(session);
          }}
          disabled={toggling}
          title={canceled ? "إلغاء الإلغاء (استعادة التدريب)" : "إلغاء هذا التدريب"}
          className={cn(
            "shrink-0 rounded-full w-3.5 h-3.5 flex items-center justify-center text-[9px]",
            "opacity-0 group-hover:opacity-100 transition",
            canceled
              ? "bg-emerald-400/20 text-emerald-300 hover:bg-emerald-400/40"
              : "bg-red-500/20 text-red-300 hover:bg-red-500/40"
          )}
        >
          {canceled ? "↺" : "✕"}
        </button>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type AddModal = { type: "add"; date: string };
type EditModal = { type: "edit"; event: DbCalendarEvent };
type ActiveModal = AddModal | EditModal | null;

export default function CalendarPage() {
  const [selectedMonth, setSelectedMonth] = useState(monthKey(todayISO()));
  const [branchFilter,  setBranchFilter]  = useState<string>("all");
  // Mobile: day-focused navigation
  const [selectedDay, setSelectedDay] = useState<string>(todayISO());

  const [branches,  setBranches]  = useState<DbBranch[]>([]);
  const [events,    setEvents]    = useState<DbCalendarEvent[]>([]);
  const [userRole,  setUserRole]  = useState<UserRole>("admin_staff");
  const [players,   setPlayers]   = useState<DbPlayer[]>([]);
  const [staff,     setStaff]     = useState<DbStaff[]>([]);

  const [loading,  setLoading]   = useState(true);
  const [error,    setError]     = useState<string | null>(null);
  const [saving,   setSaving]    = useState(false);
  const [toggling, setToggling]  = useState<string | null>(null); // `${branchId}:${date}`

  const [modal, setModal] = useState<ActiveModal>(null);

  // ── Pending cancel: session waiting for cancellation options confirmation ───
  const [pendingCancel, setPendingCancel] = useState<{
    session:              GeneratedSession;
    branch:               DbBranch | null;
    sessionVal:           number;    // computed per-session field cost (0 if not per_session)
    isPerSession:         boolean;   // whether to show field cost checkbox
    affectedPlayersCount: number;    // players active on this session date
    affectedStaffCount:   number;    // active staff assigned to this branch
  } | null>(null);

  const canEdit =
    userRole === "owner" ||
    userRole === "partner" ||
    userRole === "branch_manager";

  const today = todayISO();

  // Load branches + role once
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [dbBranches, role, dbPlayers, dbStaff] = await Promise.all([
          listBranches(),
          getUserRole(),
          listPlayers(),
          listStaff(),
        ]);
        if (cancelled) return;
        setBranches(dbBranches);
        setUserRole(role);
        setPlayers(dbPlayers);
        setStaff(dbStaff);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "خطأ في التحميل");
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  // Load override events (cancellations + match + special_event) when month changes
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const dbEvents = await listCalendarEvents(
          firstOfMonth(selectedMonth),
          lastOfMonth(selectedMonth)
        );
        if (cancelled) return;
        setEvents(dbEvents);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "خطأ في تحميل الأحداث");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [selectedMonth]);

  // Sync selectedDay when month changes: keep today if in month, else first day
  useEffect(() => {
    const first = firstOfMonth(selectedMonth);
    const last  = lastOfMonth(selectedMonth);
    if (selectedDay < first || selectedDay > last) {
      const t = todayISO();
      setSelectedDay(t >= first && t <= last ? t : first);
    }
  }, [selectedMonth]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-generate training sessions from branch schedules (in-memory) ───────
  const generatedSessions = useMemo(
    () => generateTrainingSessions(selectedMonth, branches),
    [selectedMonth, branches]
  );

  // ── Map: `${branchId}:${date}` → canceled event id ────────────────────────
  const canceledMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const ev of events) {
      if (ev.event_type === "canceled" && ev.branch_id) {
        map.set(`${ev.branch_id}:${ev.date}`, ev.id);
      }
    }
    return map;
  }, [events]);

  // ── Sessions per day, filtered by branchFilter ────────────────────────────
  const sessionsByDate = useMemo(() => {
    const map = new Map<string, GeneratedSession[]>();
    for (const s of generatedSessions) {
      if (branchFilter !== "all" && s.branchId !== branchFilter) continue;
      if (!map.has(s.date)) map.set(s.date, []);
      map.get(s.date)!.push(s);
    }
    return map;
  }, [generatedSessions, branchFilter]);

  // ── Manual events per day (match, special_event, legacy training) ─────────
  const manualEventsByDate = useMemo(() => {
    const map = new Map<string, DbCalendarEvent[]>();
    for (const ev of events) {
      if (ev.event_type === "canceled") continue; // handled via canceledMap
      if (branchFilter !== "all" && ev.branch_id && ev.branch_id !== branchFilter) continue;
      if (!map.has(ev.date)) map.set(ev.date, []);
      map.get(ev.date)!.push(ev);
    }
    return map;
  }, [events, branchFilter]);

  const branchNameById = useMemo(
    () => new Map(branches.map((b) => [b.id, b.name])),
    [branches]
  );

  const calendarCells = useMemo(
    () => buildCalendarGrid(selectedMonth),
    [selectedMonth]
  );

  // ── Toggle cancel/restore for a training session ─────────────────────────
  const handleToggleCancel = useCallback(async (session: GeneratedSession) => {
    const key        = `${session.branchId}:${session.date}`;
    const canceledId = canceledMap.get(key);
    const branch     = branches.find((b) => b.id === session.branchId);

    if (canceledId) {
      // ── Restore training ──────────────────────────────────────────────────
      setToggling(key);
      try {
        const cancelledEvent = events.find((e) => e.id === canceledId);
        // Use the stored player IDs from cancel time — this is the canonical list
        // of who was compensated and must have their compensation reversed.
        // Falls back to [] for sessions cancelled before migration 30, which
        // skips reversal safely rather than using stale current-state evaluation.
        const compensatedPlayerIds = cancelledEvent?.compensated_player_ids ?? [];

        // All DB operations run first in an ordered, rollback-capable sequence.
        // The calendar event is only removed once all DB operations succeed —
        // this ensures the UI never shows the training as "active" while the
        // session record or player sessions are still in the cancelled state.
        const result = await orchestrateRestoreSession(
          session.branchId,
          session.date,
          compensatedPlayerIds,
          branch?.days ?? []
        );
        if (!result.ok) throw new Error(result.error);

        await deleteCalendarEvent(canceledId);
        setEvents((prev) => prev.filter((e) => e.id !== canceledId));
      } catch (e) {
        setError(e instanceof Error ? e.message : "خطأ في تحديث الجلسة");
      } finally {
        setToggling(null);
      }
    } else {
      // ── Cancel training: always show the options dialog ───────────────────
      const isPerSession =
        !!branch &&
        branch.rent_type === "per_session" &&
        Number(branch.monthly_rent ?? 0) > 0;

      let sessionVal = 0;
      if (isPerSession && branch) {
        const [sy, sm] = session.date.split("-").map(Number);
        sessionVal = computeFieldCostPerSession(
          Number(branch.monthly_rent), sy, sm, branch.days ?? []
        );
      }

      // Compute impact counts using real data already loaded
      const affectedPlayersCount = players.filter(
        (p) => p.branch_id === session.branchId && isPlayerActiveOnDate(p, session.date)
      ).length;
      const affectedStaffCount = staff.filter(
        (s) => s.is_active && (s.branch_ids ?? []).includes(session.branchId)
      ).length;

      setPendingCancel({
        session,
        branch: branch ?? null,
        sessionVal,
        isPerSession,
        affectedPlayersCount,
        affectedStaffCount,
      });
    }
  }, [canceledMap, branches]);

  // ── Confirm cancel (from dialog) ──────────────────────────────────────────
  const handleConfirmCancel = useCallback(async (
    removeFieldCost: boolean,
    deductCoach:     boolean,
    extendPlayers:   boolean
  ) => {
    if (!pendingCancel) return;
    const { session, sessionVal, branch } = pendingCancel;
    const key = `${session.branchId}:${session.date}`;
    setPendingCancel(null);
    setToggling(key);
    try {
      const noteParts: string[] = [];
      if (removeFieldCost) noteParts.push("تم إزالة تكلفة الملعب");
      if (deductCoach)     noteParts.push("تم خصم راتب الجلسة");
      if (extendPlayers)   noteParts.push("تم تمديد اللاعبين");
      const note = noteParts.length ? noteParts.join(" · ") : null;

      // All DB operations run first in a single ordered, rollback-capable call.
      // Steps inside: (1) session record + finance, (2) coach deductions,
      // (3) player compensation. If any step fails the previous steps are
      // rolled back automatically before the error is surfaced here.
      const result = await orchestrateCancelSession({
        branchId:      session.branchId,
        date:          session.date,
        fieldCost:     removeFieldCost ? 0 : sessionVal,
        deductCoach,
        extendPlayers,
        branchDays:    branch?.days ?? [],
        note,
      });
      if (!result.ok) throw new Error(result.error);

      // Calendar event is created only after all DB operations succeed.
      // compensated_player_ids stores the exact player IDs that received
      // session compensation, enabling precise reversal on restore.
      const newEv = await createCalendarEvent({
        branch_id:              session.branchId,
        date:                   session.date,
        event_type:             "canceled",
        title:                  `تدريب ملغي — ${session.branchName}`,
        note,
        deduct_sessions:        extendPlayers,
        compensated_player_ids: result.compensatedPlayerIds,
      });
      setEvents((prev) =>
        [...prev, newEv].sort((a, b) => a.date.localeCompare(b.date))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطأ في إلغاء الجلسة");
    } finally {
      setToggling(null);
    }
  }, [pendingCancel]);

  // ── Add manual event ──────────────────────────────────────────────────────
  async function handleAddEvent(form: EventFormValues) {
    if (!form.title.trim() || !form.date) return;
    setSaving(true);
    try {
      // Pre-compute session deduction eligibility BEFORE creating the event so we
      // can persist the intent on the record (needed for restore on delete).
      let willDeductSessions = false;
      let qualifying: DbPlayer[] = [];

      if (form.event_type === "training" && form.deductSessions && form.branch_id) {
        // isPlayerActiveOnDate is the single source of truth for subscription
        // activity checks — same function used in the compensation path.
        qualifying = players.filter((p) =>
          p.branch_id === form.branch_id &&
          p.subscription_mode === "حصص" &&
          isPlayerActiveOnDate(p, form.date)
        );

        const branch = branches.find((b) => b.id === form.branch_id);
        const branchJsDays = (branch?.days ?? [])
          .map((day) => ARABIC_TO_JS_DAY[day])
          .filter((n): n is number => n !== undefined);
        const isScheduledDay = branchJsDays.includes(
          new Date(form.date + "T00:00:00").getDay()
        );

        // Only non-scheduled days with eligible players consume a session
        willDeductSessions = !isScheduledDay && qualifying.length > 0;
      }

      const payload: CalendarEventInsert = {
        title:           form.title.trim(),
        date:            form.date,
        event_type:      form.event_type as CalendarEventType,
        branch_id:       form.branch_id || null,
        note:            form.note.trim() || null,
        deduct_sessions: willDeductSessions,
      };
      const created = await createCalendarEvent(payload);
      setEvents((prev) =>
        [...prev, created].sort((a, b) => a.date.localeCompare(b.date))
      );

      // Note: attendance records are NOT pre-created here — the date appears in the
      // attendance page via calendar events merge, and the admin marks present/absent manually.

      // Deduct sessions only when the session has fully ended (past the end time).
      // Same-day future sessions (end time not yet reached) are NOT deducted yet —
      // the session is still ongoing/upcoming and should not be consumed early.
      // Future-date sessions are never deducted at creation time.
      if (willDeductSessions && qualifying.length > 0) {
        const todayStr = new Date().toISOString().slice(0, 10);
        const branch   = branches.find((b) => b.id === form.branch_id);
        if (sessionHasEnded(form.date, branch?.end_time, todayStr)) {
          // Optimistically update local player sessions count
          setPlayers((prev) =>
            prev.map((p) =>
              qualifying.some((q) => q.id === p.id)
                ? { ...p, sessions: Math.max(0, p.sessions - 1) }
                : p
            )
          );
          // Server-side decrement (fire-and-forget)
          Promise.all(
            qualifying.map((p) =>
              updatePlayer(p.id, { sessions: Math.max(0, p.sessions - 1) }).catch(() => null)
            )
          ).catch(() => null);
        }
      }

      setModal(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطأ في حفظ الحدث");
    } finally {
      setSaving(false);
    }
  }

  // ── Edit manual event ─────────────────────────────────────────────────────
  async function handleEditEvent(id: string, payload: Partial<CalendarEventInsert>) {
    setSaving(true);
    try {
      const updated = await updateCalendarEvent(id, payload);
      setEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
      setModal(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطأ في تعديل الحدث");
    } finally {
      setSaving(false);
    }
  }

  // ── Delete manual event ───────────────────────────────────────────────────
  async function handleDeleteEvent(id: string) {
    setSaving(true);
    try {
      // Capture event before deletion so we can decide whether to restore sessions.
      const ev = events.find((e) => e.id === id);

      await deleteCalendarEvent(id);
      setEvents((prev) => prev.filter((e) => e.id !== id));

      // Restore sessions consumed by this extra training event, but only if:
      //   1. The event was flagged to deduct sessions (deduct_sessions = true)
      //   2. The session has fully ended (past end_time) — matching the exact
      //      condition used when the deduction was originally applied.
      //      If deleted before the session ended, no deduction happened → nothing to restore.
      if (ev && ev.event_type === "training" && ev.deduct_sessions && ev.branch_id) {
        const todayStr = new Date().toISOString().slice(0, 10);
        const branch   = branches.find((b) => b.id === ev.branch_id);
        if (sessionHasEnded(ev.date, branch?.end_time, todayStr)) {
          const qualifying = players.filter((p) => {
            if (p.branch_id !== ev.branch_id) return false;
            if (p.is_paused) return false;
            if (p.subscription_mode !== "حصص") return false;
            if (p.start_date && p.start_date > ev.date) return false;
            if (!p.end_date) return true;
            return p.end_date >= ev.date;
          });

          if (qualifying.length > 0) {
            // Optimistically restore sessions in local state
            setPlayers((prev) =>
              prev.map((p) =>
                qualifying.some((q) => q.id === p.id)
                  ? { ...p, sessions: p.sessions + 1 }
                  : p
              )
            );
            // Server-side restore (fire-and-forget)
            Promise.all(
              qualifying.map((p) =>
                updatePlayer(p.id, { sessions: p.sessions + 1 }).catch(() => null)
              )
            ).catch(() => null);
          }
        }
      }

      setModal(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطأ في حذف الحدث");
    } finally {
      setSaving(false);
    }
  }

  // ── Month summary counts ──────────────────────────────────────────────────
  const totalTrainingSessions = useMemo(
    () =>
      generatedSessions.filter(
        (s) => branchFilter === "all" || s.branchId === branchFilter
      ).length,
    [generatedSessions, branchFilter]
  );

  const totalCanceled = useMemo(
    () =>
      Array.from(canceledMap.keys()).filter(
        (key) => branchFilter === "all" || key.startsWith(branchFilter)
      ).length,
    [canceledMap, branchFilter]
  );

  const manualEventsFiltered = useMemo(
    () =>
      events.filter((ev) => {
        if (ev.event_type === "canceled") return false;
        if (branchFilter !== "all" && ev.branch_id && ev.branch_id !== branchFilter)
          return false;
        return true;
      }),
    [events, branchFilter]
  );

  if (error) {
    return (
      <main className="flex-1 flex items-center justify-center p-8">
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-8 text-center max-w-sm">
          <div className="text-red-300 font-semibold mb-2">خطأ في التحميل</div>
          <div className="text-white/60 text-sm">{error}</div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="mt-3 text-xs text-white/50 hover:text-white/80 underline"
          >
            إغلاق
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 p-6 md:p-8">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute right-[-200px] top-[-220px] h-[520px] w-[520px] rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="absolute left-[-240px] bottom-[-260px] h-[560px] w-[560px] rounded-full bg-cyan-400/10 blur-3xl" />
      </div>

      {/* ── Field cost removal dialog (per_session branches) ────────────── */}
      {pendingCancel && (
        <CancelSessionDialog
          branchName={pendingCancel.session.branchName}
          date={pendingCancel.session.date}
          sessionVal={pendingCancel.sessionVal}
          isPerSession={pendingCancel.isPerSession}
          affectedPlayersCount={pendingCancel.affectedPlayersCount}
          affectedStaffCount={pendingCancel.affectedStaffCount}
          onConfirm={handleConfirmCancel}
          onDismiss={() => setPendingCancel(null)}
        />
      )}

      {/* Modals */}
      {modal?.type === "add" && (
        <EventFormModal
          initial={(() => {
            const bid = branchFilter !== "all" ? branchFilter : (branches[0]?.id ?? "");
            const bName = branches.find((b) => b.id === bid)?.name ?? "";
            return {
              title:          bName ? `تدريب — ${bName}` : "",
              date:           modal.date,
              event_type:     "training" as ManualEventType,
              branch_id:      bid,
              note:           "",
              deductSessions: false,
            };
          })()}
          branches={branches}
          onSave={handleAddEvent}
          onClose={() => setModal(null)}
          saving={saving}
        />
      )}
      {modal?.type === "edit" && (
        <EditEventModal
          event={modal.event}
          branches={branches}
          onSave={handleEditEvent}
          onDelete={handleDeleteEvent}
          onClose={() => setModal(null)}
          saving={saving}
        />
      )}

      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-sm text-white/60">التقويم</div>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight">
              تقويم الأكاديمية 📅
            </h1>
            <div className="mt-1 text-sm text-white/50">
              جلسات التدريب تلقائية من إعدادات الفروع · المباريات والأحداث يدوية
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="h-9 rounded-xl bg-white/5 border border-white/10 px-3 text-xs text-white outline-none"
            >
              <option value="all">كل الفروع</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>

            {canEdit && (
              <button
                type="button"
                onClick={() => setModal({ type: "add", date: today })}
                className="h-9 rounded-xl bg-emerald-500/20 border border-emerald-400/30 px-4 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/30 transition"
              >
                + إضافة حدث / تدريب
              </button>
            )}
          </div>
        </div>

        {/* Month navigation */}
        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setSelectedMonth(prevMonthKey(selectedMonth))}
            className="rounded-xl bg-white/5 border border-white/10 px-4 py-2 text-sm text-white/70 hover:bg-white/10 transition"
          >
            ‹ السابق
          </button>

          <div className="text-center">
            <div className="text-lg font-bold">{monthLabel(selectedMonth)}</div>
            {selectedMonth !== monthKey(today) && (
              <button
                type="button"
                onClick={() => setSelectedMonth(monthKey(today))}
                className="text-xs text-emerald-400 hover:text-emerald-300 transition"
              >
                الشهر الحالي
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setSelectedMonth(nextMonthKey(selectedMonth))}
            className="rounded-xl bg-white/5 border border-white/10 px-4 py-2 text-sm text-white/70 hover:bg-white/10 transition"
          >
            التالي ›
          </button>
        </div>

        {/* Month summary */}
        <div className="mt-4 flex flex-wrap gap-3 text-xs">
          <div className="flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-3 py-2 text-emerald-300">
            <span>🏃</span>
            <span>جلسات التدريب: <strong>{totalTrainingSessions}</strong></span>
            {totalCanceled > 0 && (
              <span className="text-red-300">({totalCanceled} ملغية)</span>
            )}
          </div>
          {manualEventsFiltered.length > 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-blue-400/20 bg-blue-400/5 px-3 py-2 text-blue-300">
              <span>🗓️</span>
              <span>أحداث مضافة: <strong>{manualEventsFiltered.length}</strong></span>
            </div>
          )}
          {canEdit && (
            <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white/50">
              <span className="text-[10px]">مرر على الجلسة لإلغائها</span>
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full px-2.5 py-1 border text-emerald-300 bg-emerald-400/10 border-emerald-400/20">
            تدريب (تلقائي)
          </span>
          <span className="rounded-full px-2.5 py-1 border text-red-300 bg-red-500/10 border-red-500/20 line-through">
            تدريب ملغي
          </span>
          <span className={cn("rounded-full px-2.5 py-1", eventTypeColor["match"])}>
            {eventTypeLabel["match"]}
          </span>
          <span className={cn("rounded-full px-2.5 py-1", eventTypeColor["special_event"])}>
            {eventTypeLabel["special_event"]}
          </span>
        </div>

        {/* ── Mobile: day-focused view (hidden on md+) ─────────────────── */}
        <div className="md:hidden mt-4 space-y-3">
          {/* Day navigation */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const prev = new Date(selectedDay + "T00:00:00");
                prev.setDate(prev.getDate() - 1);
                const prevISO = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}-${String(prev.getDate()).padStart(2, "0")}`;
                if (prevISO >= firstOfMonth(selectedMonth)) setSelectedDay(prevISO);
                else {
                  const pm = prevMonthKey(selectedMonth);
                  setSelectedMonth(pm);
                  setSelectedDay(lastOfMonth(pm));
                }
              }}
              className="h-10 w-10 shrink-0 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:bg-white/10 transition"
            >
              ‹
            </button>
            <div className="flex-1 text-center">
              <div className="text-sm font-bold text-white">
                {WEEKDAY_LABELS[new Date(selectedDay + "T00:00:00").getDay()]}
              </div>
              <div className="text-xs text-white/50">
                {Number(selectedDay.slice(8))} {ARABIC_MONTHS[selectedDay.slice(5, 7)]} {selectedDay.slice(0, 4)}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                const next = new Date(selectedDay + "T00:00:00");
                next.setDate(next.getDate() + 1);
                const nextISO = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
                if (nextISO <= lastOfMonth(selectedMonth)) setSelectedDay(nextISO);
                else {
                  const nm = nextMonthKey(selectedMonth);
                  setSelectedMonth(nm);
                  setSelectedDay(firstOfMonth(nm));
                }
              }}
              className="h-10 w-10 shrink-0 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:bg-white/10 transition"
            >
              ›
            </button>
          </div>

          {/* Events for selected day */}
          {loading ? (
            <div className="py-6 text-center text-sm text-white/50">جاري التحميل...</div>
          ) : (
            <>
              {(sessionsByDate.get(selectedDay) ?? [])
                .filter((s) => branchFilter === "all" || s.branchId === branchFilter)
                .map((s) => {
                  const key      = `${s.branchId}:${selectedDay}`;
                  const canceled = canceledMap.has(key);
                  const timeStr  = s.startTime
                    ? `${formatTime(s.startTime)}${s.endTime ? `–${formatTime(s.endTime)}` : ""}`
                    : "";
                  return (
                    <div
                      key={key}
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-xl px-4 py-3 border text-sm",
                        canceled
                          ? "text-red-300 bg-red-500/10 border-red-500/20"
                          : getBranchColor(s.branchId)
                      )}
                    >
                      <div className="min-w-0">
                        <div className={cn("font-semibold", canceled && "line-through opacity-70")}>
                          {canceled ? "ملغي" : "تدريب"} — {s.branchName}
                        </div>
                        {timeStr && <div className="text-xs opacity-60 mt-0.5">{timeStr}</div>}
                      </div>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => handleToggleCancel(s)}
                          disabled={toggling === key}
                          className={cn(
                            "shrink-0 text-xs px-3 py-1.5 rounded-lg border transition",
                            canceled
                              ? "bg-emerald-400/15 border-emerald-400/30 text-emerald-300 hover:bg-emerald-400/25"
                              : "bg-red-500/15 border-red-500/30 text-red-300 hover:bg-red-500/25"
                          )}
                        >
                          {toggling === key ? "..." : canceled ? "استعادة" : "إلغاء"}
                        </button>
                      )}
                    </div>
                  );
                })}

              {(manualEventsByDate.get(selectedDay) ?? [])
                .filter((ev) => branchFilter === "all" || ev.branch_id === branchFilter || !ev.branch_id)
                .map((ev) => (
                  <div
                    key={ev.id}
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-xl px-4 py-3 border text-sm",
                      eventTypeColor[ev.event_type]
                    )}
                  >
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{ev.title}</div>
                      {ev.note && <div className="text-xs opacity-60 mt-0.5 truncate">{ev.note}</div>}
                    </div>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => setModal({ type: "edit", event: ev })}
                        className="shrink-0 text-xs px-3 py-1.5 rounded-lg border border-white/20 bg-white/10 text-white/70 hover:bg-white/15 transition"
                      >
                        تعديل
                      </button>
                    )}
                  </div>
                ))}

              {(sessionsByDate.get(selectedDay) ?? []).filter((s) => branchFilter === "all" || s.branchId === branchFilter).length === 0 &&
               (manualEventsByDate.get(selectedDay) ?? []).filter((ev) => branchFilter === "all" || ev.branch_id === branchFilter || !ev.branch_id).length === 0 && (
                <div className="py-8 text-center text-sm text-white/40 rounded-xl border border-white/5 bg-white/[0.02]">
                  لا توجد جلسات أو أحداث لهذا اليوم
                </div>
              )}

              {canEdit && (
                <button
                  type="button"
                  onClick={() => setModal({ type: "add", date: selectedDay })}
                  className="w-full h-10 rounded-xl border border-dashed border-white/20 text-sm text-white/50 hover:border-[#63C0B0]/40 hover:text-[#63C0B0]/80 transition"
                >
                  + إضافة حدث لهذا اليوم
                </button>
              )}
            </>
          )}
        </div>

        {/* Calendar grid (desktop only) */}
        <div className="hidden md:block mt-4 overflow-x-auto rounded-2xl border border-white/10">
        <div className="min-w-[360px] bg-white/5 overflow-hidden rounded-2xl">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 border-b border-white/10">
            {WEEKDAY_LABELS.map((label) => (
              <div key={label} className="py-3 md:py-4 text-center text-xs md:text-sm font-semibold text-white/55">
                {label}
              </div>
            ))}
          </div>

          {loading && (
            <div className="py-12 text-center text-sm text-white/50">
              جاري تحميل الأحداث...
            </div>
          )}

          {!loading && (
            <div className="grid grid-cols-7">
              {calendarCells.map((dateISO, idx) => {
                const isToday    = dateISO === today;
                const sessions   = dateISO ? (sessionsByDate.get(dateISO)   ?? []) : [];
                const manualEvs  = dateISO ? (manualEventsByDate.get(dateISO) ?? []) : [];
                const hasCanceled = sessions.some(
                  (s) => canceledMap.has(`${s.branchId}:${dateISO}`)
                );

                return (
                  <div
                    key={idx}
                    className={cn(
                      "min-h-[90px] md:min-h-[140px] border-b border-l border-white/5 p-1.5 relative",
                      idx % 7 === 0 && "border-l-0",
                      !dateISO && "bg-white/[0.01]",
                      isToday && "bg-emerald-400/5"
                    )}
                  >
                    {dateISO && (
                      <>
                        <div className="flex items-center justify-between mb-0.5">
                          <div
                            className={cn(
                              "inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold",
                              isToday ? "bg-emerald-400 text-black" : "text-white/70"
                            )}
                          >
                            {Number(dateISO.slice(8))}
                          </div>

                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => setModal({ type: "add", date: dateISO })}
                              className="h-5 w-5 rounded-full bg-white/10 text-white/50 hover:bg-[#63C0B0]/20 hover:text-[#63C0B0] transition text-xs font-bold flex items-center justify-center"
                              title="إضافة حدث أو تدريب"
                            >
                              +
                            </button>
                          )}
                        </div>

                        {/* Auto-generated training sessions */}
                        <div className="space-y-0.5">
                          {sessions.slice(0, 2).map((s) => {
                            const key      = `${s.branchId}:${dateISO}`;
                            const canceled = canceledMap.has(key);
                            return (
                              <TrainingBadge
                                key={key}
                                session={s}
                                canceled={canceled}
                                canEdit={canEdit}
                                toggling={toggling === key}
                                onToggle={handleToggleCancel}
                              />
                            );
                          })}
                          {sessions.length > 2 && (
                            <div className="text-[9px] text-white/40 pr-0.5">
                              +{sessions.length - 2} جلسات
                            </div>
                          )}

                          {/* Manual events (match, special_event) */}
                          {manualEvs.slice(0, 2).map((ev) => (
                            <div
                              key={ev.id}
                              className={cn(
                                "rounded-lg px-1.5 py-0.5 text-[10px] leading-snug truncate cursor-pointer",
                                "hover:brightness-125 transition",
                                eventTypeColor[ev.event_type]
                              )}
                              title={ev.title}
                              onClick={() =>
                                canEdit ? setModal({ type: "edit", event: ev }) : undefined
                              }
                            >
                              {ev.title}
                            </div>
                          ))}
                          {manualEvs.length > 2 && (
                            <div className="text-[9px] text-white/40 pr-0.5">
                              +{manualEvs.length - 2}
                            </div>
                          )}
                        </div>

                        {/* Canceled indicator dot */}
                        {hasCanceled && (
                          <div className="absolute bottom-1 left-1 h-1.5 w-1.5 rounded-full bg-red-400" />
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>{/* min-w */}
        </div>{/* overflow-x-auto / hidden md:block */}

        {/* Manual events list for this month */}
        {manualEventsFiltered.length > 0 && (
          <div className="mt-6">
            <div className="text-sm font-semibold text-white/70 mb-3">
              أحداث مضافة — {monthLabel(selectedMonth)}
            </div>
            <div className="space-y-2">
              {manualEventsFiltered.map((ev) => (
                <div
                  key={ev.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={cn(
                        "shrink-0 rounded-lg px-2 py-0.5 text-xs font-medium",
                        eventTypeColor[ev.event_type]
                      )}
                    >
                      {eventTypeLabel[ev.event_type]}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white/90 truncate">
                        {ev.title}
                      </div>
                      {ev.branch_id && (
                        <div className="text-xs text-white/45">
                          {branchNameById.get(ev.branch_id) ?? "فرع"}
                        </div>
                      )}
                      {ev.note && (
                        <div className="text-xs text-white/40 mt-0.5">{ev.note}</div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-xs text-white/50">
                      {ev.date.slice(8, 10)}/{ev.date.slice(5, 7)}
                    </div>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => setModal({ type: "edit", event: ev })}
                        className="rounded-lg bg-white/5 border border-white/10 px-2.5 py-1 text-xs text-white/60 hover:bg-white/10 transition"
                      >
                        تعديل
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Canceled sessions list */}
        {totalCanceled > 0 && (
          <div className="mt-4">
            <div className="text-sm font-semibold text-white/70 mb-3">
              جلسات ملغية هذا الشهر ({totalCanceled})
            </div>
            <div className="space-y-1.5">
              {Array.from(canceledMap.entries())
                .filter(([key]) => branchFilter === "all" || key.startsWith(branchFilter))
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([key, canceledId]) => {
                  const [branchId, date] = key.split(":");
                  const session = generatedSessions.find(
                    (s) => s.branchId === branchId && s.date === date
                  );
                  if (!session) return null;
                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between gap-3 rounded-xl border border-red-500/15 bg-red-500/5 px-4 py-2.5"
                    >
                      <div className="flex items-center gap-3 text-sm">
                        <span className="text-red-300 line-through opacity-70">
                          تدريب — {session.branchName}
                        </span>
                        <span className="text-white/40 text-xs">
                          {date.slice(8, 10)}/{date.slice(5, 7)}
                        </span>
                      </div>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => handleToggleCancel(session)}
                          disabled={toggling === key}
                          className="text-xs text-emerald-400 hover:text-emerald-300 transition"
                        >
                          استعادة
                        </button>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {!loading && branches.length === 0 && (
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
            <div className="text-2xl mb-2">🏟️</div>
            <div className="text-sm text-white/55">
              لا توجد فروع مسجّلة — أضف فرعاً أولاً لظهور جلسات التدريب تلقائياً
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
