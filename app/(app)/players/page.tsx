"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/app/components/ui/Button";
import {
  type DbPlayer,
  listPlayers,
  createPlayer,
  updatePlayer,
  deletePlayer,
  pausePlayer,
  resumePlayer,
} from "@/src/lib/supabase/players";
import {
  createPayment,
  updatePayment,
  listPlayerPayments,
  type DbPayment,
} from "@/src/lib/supabase/payments";
import {
  type DbBranch,
  listBranches,
} from "@/src/lib/supabase/branches";
import {
  createSubscriptionEvent,
  listSubscriptionEvents,
  type DbSubscriptionEvent,
  type SubscriptionEventType,
} from "@/src/lib/supabase/subscription-events";

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
type Status = "نشط" | "قريب" | "منتهي" | "تجميد";
type SubscriptionMode = "حصص" | "شهري";
type FilterKey = "all" | "active" | "ending7" | "expired";
type ModalType = "add" | "edit" | "renew" | "extend" | "history";

type Player = {
  id: string;
  academy_id: string;
  name: string;
  birth: string;
  phone: string;
  branchId: string | null;
  subscriptionMode: SubscriptionMode;
  sessions: number;
  price: number;
  start: string;    // DD/MM/YYYY
  end: string;      // DD/MM/YYYY or "—"
  isLegacy: boolean;
  isPaused: boolean;
};

// ── Date conversion helpers ───────────────────────────────────────────────────
function isoToDDMMYYYY(iso: string): string {
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  const [yyyy, mm, dd] = parts;
  return `${dd}/${mm}/${yyyy}`;
}
function ddmmyyyyToISO(ddmmyyyy: string): string {
  const parts = ddmmyyyy.split("/");
  if (parts.length !== 3) return "";
  const [dd, mm, yyyy] = parts;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}
function dbToPlayer(db: DbPlayer): Player {
  return {
    id: db.id,
    academy_id: db.academy_id,
    name: db.name,
    birth: db.birth,
    phone: db.phone,
    branchId: db.branch_id,
    subscriptionMode: db.subscription_mode as SubscriptionMode,
    sessions: db.sessions,
    price: Number(db.price),
    start: db.start_date ? isoToDDMMYYYY(db.start_date) : "—",
    end: db.end_date ? isoToDDMMYYYY(db.end_date) : "—",
    isLegacy: db.is_legacy,
    isPaused: db.is_paused ?? false,
  };
}

// ── Branch mapping ────────────────────────────────────────────────────────────
type BranchLite = {
  id: string;
  name: string;
  price: number;
  days: string[];
  subscriptionMode: SubscriptionMode;
};
function dbToBranchLite(db: DbBranch): BranchLite {
  return {
    id: db.id,
    name: db.name,
    price: db.price,
    days: db.days,
    subscriptionMode: db.subscription_mode as SubscriptionMode,
  };
}

// ── UI Helpers ────────────────────────────────────────────────────────────────
const statusStyles: Record<Status, string> = {
  نشط:   "bg-green-500/15 text-green-400",
  قريب:  "bg-amber-500/15 text-amber-300",
  منتهي: "bg-red-500/15 text-red-400",
  تجميد: "bg-blue-500/15 text-blue-400",
};

// ── Date calculation helpers ──────────────────────────────────────────────────
function isoToDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function dateToISO(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function ddmmyyyyToDate(ddmmyyyy: string) {
  const parts = ddmmyyyy.split("/");
  if (parts.length !== 3) return null;
  const [dd, mm, yyyy] = parts.map(Number);
  if (!dd || !mm || !yyyy) return null;
  const d = new Date(yyyy, mm - 1, dd);
  return Number.isNaN(d.getTime()) ? null : d;
}
function formatDDMMYYYYFromDate(d: Date) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}
function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function addMonthsClamped(date: Date, months: number) {
  const y = date.getFullYear();
  const m = date.getMonth();
  const day = date.getDate();
  const targetFirst = new Date(y, m + months, 1);
  const lastDay = new Date(
    targetFirst.getFullYear(),
    targetFirst.getMonth() + 1,
    0
  ).getDate();
  return new Date(
    targetFirst.getFullYear(),
    targetFirst.getMonth(),
    Math.min(day, lastDay)
  );
}

// ── Days map ──────────────────────────────────────────────────────────────────
const AR_DAY_TO_JS: Record<string, number> = {
  الأحد: 0,
  الاثنين: 1,
  "الإثنين": 1,
  الثلاثاء: 2,
  الأربعاء: 3,
  الخميس: 4,
  الجمعة: 5,
  السبت: 6,
};

// ── End date computation ──────────────────────────────────────────────────────
function computeMonthlyEnd(startISO: string): string {
  const start = isoToDate(startISO);
  return formatDDMMYYYYFromDate(addDays(addMonthsClamped(start, 1), -1));
}
function computeMonthlyEndISO(startISO: string): string {
  return ddmmyyyyToISO(computeMonthlyEnd(startISO));
}
function computeSessionsEnd(
  startISO: string,
  branchDays: string[],
  sessions: number
): string {
  const start = isoToDate(startISO);
  const dayNums = new Set<number>(
    branchDays.map((d) => AR_DAY_TO_JS[d]).filter((n) => typeof n === "number")
  );
  if (dayNums.size === 0 || !Number.isFinite(sessions) || sessions <= 0)
    return "—";
  let count = 0;
  let cursor = new Date(start);
  for (let i = 0; i < 365; i++) {
    if (dayNums.has(cursor.getDay())) {
      count += 1;
      if (count === sessions) return formatDDMMYYYYFromDate(cursor);
    }
    cursor = addDays(cursor, 1);
  }
  return "—";
}
function computeSessionsEndISO(
  startISO: string,
  branchDays: string[],
  sessions: number
): string | null {
  const ddmm = computeSessionsEnd(startISO, branchDays, sessions);
  return ddmm === "—" ? null : ddmmyyyyToISO(ddmm);
}

/**
 * Compute new end_date after extending by `count` units.
 * - حصص mode: counts `count` training days from the day after currentEnd.
 * - شهري mode: adds `count` calendar days.
 */
function computeExtendEndISO(
  currentEndDDMMYYYY: string,
  mode: SubscriptionMode,
  branchDays: string[],
  count: number
): string | null {
  const endDate = ddmmyyyyToDate(currentEndDDMMYYYY);
  if (!endDate) return null;

  if (mode === "شهري") {
    return dateToISO(addDays(endDate, count));
  }

  // حصص: count N training sessions starting from day after end
  const startFrom = addDays(endDate, 1);
  const dayNums = new Set<number>(
    branchDays.map((d) => AR_DAY_TO_JS[d]).filter((n) => typeof n === "number")
  );
  if (dayNums.size === 0 || count <= 0) return null;
  let sessionCount = 0;
  let cursor = new Date(startFrom);
  for (let i = 0; i < 730; i++) {
    if (dayNums.has(cursor.getDay())) {
      sessionCount++;
      if (sessionCount === count) return dateToISO(cursor);
    }
    cursor = addDays(cursor, 1);
  }
  return null;
}

// ── Remaining sessions (estimated) ───────────────────────────────────────────
function countUsedSessionsSinceStart(
  startDDMMYYYY: string,
  branchDays: string[]
): number {
  const startISO = ddmmyyyyToISO(startDDMMYYYY);
  const start = isoToDate(startISO);
  const dayNums = new Set<number>(
    branchDays.map((d) => AR_DAY_TO_JS[d]).filter((n) => typeof n === "number")
  );
  if (dayNums.size === 0) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  let used = 0;
  for (let i = 0; i < 365; i++) {
    if (cursor.getTime() > today.getTime()) break;
    if (dayNums.has(cursor.getDay())) used += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return used;
}
function remainingSessions(
  p: Player,
  branch?: BranchLite
): number | null {
  if (p.subscriptionMode !== "حصص") return null;
  const total = Number(p.sessions || 0);
  if (!Number.isFinite(total) || total <= 0) return 0;
  if (!branch || !branch.days?.length) return total;
  const used = countUsedSessionsSinceStart(p.start, branch.days);
  return Math.max(0, total - Math.min(total, used));
}

// ── Status helpers ────────────────────────────────────────────────────────────
function daysUntilEnd(end: string): number | null {
  if (!end || end === "—") return null;
  const endDate = ddmmyyyyToDate(end);
  if (!endDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  endDate.setHours(0, 0, 0, 0);
  return Math.floor((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}
function calcStatusFromEnd(end: string, isPaused = false): Status {
  if (isPaused) return "تجميد";
  const diff = daysUntilEnd(end);
  if (diff === null) return "نشط";
  if (diff < 0) return "منتهي";
  if (diff <= 7) return "قريب";
  return "نشط";
}

// ── Duplicate check ───────────────────────────────────────────────────────────
function normalizeName(s: string) {
  return (s || "").trim().toLowerCase();
}
function findExistingPlayer(
  players: Player[],
  candidate: { name: string; birth: string },
  excludeId?: string
) {
  const cName = normalizeName(candidate.name);
  const cBirth = String(candidate.birth || "").trim();
  return players.find(
    (p) =>
      p.id !== excludeId &&
      normalizeName(p.name) === cName &&
      String(p.birth || "").trim() === cBirth
  );
}

// ── Event type config (Feature F) ────────────────────────────────────────────
const EVENT_CONFIG: Record<SubscriptionEventType, { label: string; color: string }> = {
  first_registration: { label: "أول تسجيل",           color: "bg-green-500/15 text-green-300 border-green-500/30" },
  renewal:            { label: "تجديد",                color: "bg-teal-500/15 text-teal-300 border-teal-500/30" },
  extension:          { label: "تمديد",                color: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
  paused:             { label: "تجميد الاشتراك",        color: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
  resumed:            { label: "استئناف الاشتراك",     color: "bg-green-500/15 text-green-300 border-green-500/30" },
  expired:            { label: "انتهى الاشتراك",       color: "bg-red-500/15 text-red-300 border-red-500/30" },
  returned:           { label: "تجديد",                color: "bg-teal-500/15 text-teal-300 border-teal-500/30" },
};

/**
 * Build a synthetic event timeline from payment records.
 * Used as history fallback when subscription_events table is empty for a player.
 */
function buildSyntheticHistory(payments: DbPayment[]): DbSubscriptionEvent[] {
  if (!payments.length) return [];
  const sorted = [...payments].sort((a, b) => a.date.localeCompare(b.date));
  const events: DbSubscriptionEvent[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const pmt = sorted[i];
    const eventType: SubscriptionEventType = i === 0 ? "first_registration" : "renewal";
    events.push({
      id: `synth-${pmt.id}-${eventType}`,
      academy_id: "",
      player_id: pmt.player_id,
      event_type: eventType,
      event_date: pmt.date,
      extend_days: null,
      payment_id: pmt.id,
      note: pmt.subscription_end ? `ينتهي في: ${isoToDDMMYYYY(pmt.subscription_end)}` : null,
      created_by: null,
      created_at: pmt.created_at,
    });

    // Insert "expired" event between renewals when there's a gap > 1 day
    const nextPmt = sorted[i + 1];
    if (pmt.subscription_end && nextPmt) {
      const endDate = isoToDate(pmt.subscription_end);
      const nextStart = isoToDate(nextPmt.date);
      endDate.setHours(0, 0, 0, 0);
      nextStart.setHours(0, 0, 0, 0);
      const gapDays = Math.round((nextStart.getTime() - endDate.getTime()) / (1000 * 60 * 60 * 24));
      if (gapDays > 1) {
        events.push({
          id: `synth-${pmt.id}-expired`,
          academy_id: "",
          player_id: pmt.player_id,
          event_type: "expired",
          event_date: pmt.subscription_end,
          extend_days: null,
          payment_id: null,
          note: null,
          created_by: null,
          created_at: pmt.created_at,
        });
      }
    }
  }

  // Add final "expired" event if the last subscription has already ended
  const lastPmt = sorted[sorted.length - 1];
  const todayStr = new Date().toISOString().slice(0, 10);
  if (lastPmt?.subscription_end && lastPmt.subscription_end < todayStr) {
    const lastEv = events[events.length - 1];
    if (!lastEv || lastEv.event_type !== "expired") {
      events.push({
        id: `synth-${lastPmt.id}-expired-final`,
        academy_id: "",
        player_id: lastPmt.player_id,
        event_type: "expired",
        event_date: lastPmt.subscription_end,
        extend_days: null,
        payment_id: null,
        note: null,
        created_by: null,
        created_at: lastPmt.created_at,
      });
    }
  }

  return events;
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [branches, setBranches] = useState<BranchLite[]>([]);

  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Filters
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [branchFilter, setBranchFilter] = useState<string>("all");

  // Modal
  const [open, setOpen] = useState(false);
  const [modalType, setModalType] = useState<ModalType>("add");
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);

  // Form fields
  const todayISO = new Date().toISOString().slice(0, 10);
  const [name, setName] = useState("");
  const [birth, setBirth] = useState("");
  const [phone, setPhone] = useState("");
  const [branchId, setBranchId] = useState<string>("");
  const [startDate, setStartDate] = useState(todayISO);
  const [startDateText, setStartDateText] = useState(() =>
    isoToDDMMYYYY(new Date().toISOString().slice(0, 10))
  );
  const [subscriptionMode, setSubscriptionMode] = useState<SubscriptionMode>("حصص");
  const [sessionsInput, setSessionsInput] = useState<string>("12");
  const [priceInput, setPriceInput] = useState<string>("0");
  const [isLegacy, setIsLegacy] = useState(false);

  // Feature B: Extend
  const [extendDays, setExtendDays] = useState<number>(7);

  // Fix 6: Preserve extended end_date when editing (only recompute if sub params changed)
  const [originalEndDateISO, setOriginalEndDateISO] = useState<string | null>(null);
  const [originalSubParams, setOriginalSubParams] = useState<{
    startDate: string; mode: SubscriptionMode; branchId: string; sessions: number;
  } | null>(null);

  // Feature C: Pause toggle
  const [pauseToggling, setPauseToggling] = useState<string | null>(null);

  // Feature D: Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkExtendDays, setBulkExtendDays] = useState<number>(7);
  const [bulkConfirm, setBulkConfirm] = useState<"extend" | "delete" | null>(null);
  const [bulkProcessing, setBulkProcessing] = useState(false);

  // Feature F: History
  const [historyEvents, setHistoryEvents] = useState<DbSubscriptionEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPlayerName, setHistoryPlayerName] = useState<string>("");

  // ── Load on mount ──────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    setPageError(null);
    try {
      const [dbPlayers, dbBranches] = await Promise.all([
        listPlayers(),
        listBranches(),
      ]);
      setPlayers(dbPlayers.map(dbToPlayer));
      setBranches(dbBranches.map(dbToBranchLite));
    } catch (e) {
      console.error("[players] load error:", e);
      setPageError(formatError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Derived: branch map ────────────────────────────────────────────────────
  const branchMap = useMemo(() => {
    const m = new Map<string, BranchLite>();
    branches.forEach((b) => m.set(b.id, b));
    return m;
  }, [branches]);

  const selectedBranch = branchId ? branchMap.get(branchId) : undefined;

  // ── Apply branch settings to form ─────────────────────────────────────────
  function applyBranchSettings(
    newBranchId: string,
    opts?: { keepPrice?: boolean; keepSessions?: boolean }
  ) {
    setBranchId(newBranchId);
    const b = branchMap.get(newBranchId);
    if (!b) return;
    setSubscriptionMode(b.subscriptionMode ?? "حصص");
    if (!opts?.keepPrice) setPriceInput(String(b.price ?? 0));
    if ((b.subscriptionMode ?? "حصص") === "حصص") {
      if (!opts?.keepSessions) setSessionsInput("12");
    } else {
      setSessionsInput("0");
    }
  }

  function handleStartDateTextChange(text: string) {
    setStartDateText(text);
    if (text.length === 10 && /^\d{2}\/\d{2}\/\d{4}$/.test(text)) {
      const iso = ddmmyyyyToISO(text);
      if (iso) setStartDate(iso);
    }
  }

  function computeEndPreview(): string {
    if (!branchId) return "—";
    if (subscriptionMode === "شهري") return computeMonthlyEnd(startDate);
    if (!selectedBranch) return "—";
    return computeSessionsEnd(
      startDate,
      selectedBranch.days ?? [],
      Number(sessionsInput)
    );
  }

  // ── Print ──────────────────────────────────────────────────────────────────
  function printPlayers(list: Player[]) {
    const title =
      branchFilter === "all"
        ? "قائمة اللاعبين — جميع الفروع"
        : `قائمة اللاعبين — ${branchMap.get(branchFilter)?.name ?? "فرع"}`;

    const rowsHtml = list
      .map((p, idx) => {
        const b = p.branchId ? branchMap.get(p.branchId) : undefined;
        const branchName = b?.name ?? "";
        const liveStatus = calcStatusFromEnd(p.end, p.isPaused);
        const sessionsLabel =
          p.subscriptionMode === "شهري"
            ? "شهري"
            : String(remainingSessions(p, b) ?? p.sessions);
        return `
          <tr>
            <td>${idx + 1}</td>
            <td>${p.name ?? ""}${p.isLegacy ? " ★" : ""}</td>
            <td>${p.birth ?? ""}</td>
            <td>${p.phone ?? ""}</td>
            <td>${branchName}</td>
            <td>${sessionsLabel}</td>
            <td>${p.price ?? ""} د.ك</td>
            <td>${p.start ?? ""}</td>
            <td>${p.end ?? ""}</td>
            <td>${liveStatus}</td>
          </tr>`;
      })
      .join("");

    const html = `
    <html dir="rtl" lang="ar">
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
        <style>
          body { font-family: Arial, Helvetica, sans-serif; padding: 24px; }
          h1 { margin: 0 0 8px 0; font-size: 18px; }
          .meta { color: #555; font-size: 12px; margin-bottom: 16px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: right; }
          th { background: #f4f4f4; }
          tr:nth-child(even) td { background: #fafafa; }
        </style>
      </head>
      <body>
        <h1>${title}</h1>
        <div class="meta">عدد اللاعبين: ${list.length} — تاريخ الطباعة: ${new Date().toLocaleDateString("ar-KW")}</div>
        <table>
          <thead>
            <tr>
              <th>#</th><th>الاسم</th><th>سنة الميلاد</th>
              <th>هاتف ولي الأمر</th><th>الفرع</th>
              <th>الحصص المتبقية</th><th>السعر</th>
              <th>تاريخ البداية</th><th>ينتهي في</th><th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || `<tr><td colspan="10">لا توجد بيانات للطباعة</td></tr>`}
          </tbody>
        </table>
        <script>window.onload = () => window.print();</script>
      </body>
    </html>`;

    const w = window.open("", "_blank", "width=1100,height=800");
    if (!w) {
      alert("المتصفح منع نافذة الطباعة. اسمح بالـ Popups ثم جرّب مرة أخرى.");
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  // ── Modal openers ──────────────────────────────────────────────────────────
  function openAddModal() {
    setModalType("add");
    setActivePlayerId(null);
    setName("");
    setBirth("");
    setPhone("");
    setBranchId("");
    const todayIso = new Date().toISOString().slice(0, 10);
    setStartDate(todayIso);
    setStartDateText(isoToDDMMYYYY(todayIso));
    setSubscriptionMode("حصص");
    setSessionsInput("12");
    setPriceInput("0");
    setIsLegacy(false);
    setSaveError(null);
    setOpen(true);
  }

  function openEditModal(playerId: string) {
    const p = players.find((x) => x.id === playerId);
    if (!p) return;
    setModalType("edit");
    setActivePlayerId(playerId);
    setName(p.name);
    setBirth(p.birth);
    setPhone(p.phone ?? "");
    setBranchId(p.branchId ?? "");
    const editStartISO =
      p.start && p.start !== "—" ? ddmmyyyyToISO(p.start) : todayISO;
    setStartDate(editStartISO);
    setStartDateText(isoToDDMMYYYY(editStartISO));
    const editMode = p.subscriptionMode;
    const editSessions = editMode === "حصص" ? p.sessions : 0;
    setSubscriptionMode(editMode);
    setSessionsInput(String(editSessions));
    setPriceInput(String(p.price ?? 0));
    setIsLegacy(p.isLegacy);
    // Fix 6: snapshot sub params so we can detect if they change
    const currentEndISO = p.end && p.end !== "—" ? ddmmyyyyToISO(p.end) : null;
    setOriginalEndDateISO(currentEndISO);
    setOriginalSubParams({
      startDate: editStartISO,
      mode: editMode,
      branchId: p.branchId ?? "",
      sessions: editSessions,
    });
    setSaveError(null);
    setOpen(true);
  }

  function openRenewModal(playerId: string) {
    const p = players.find((x) => x.id === playerId);
    if (!p) return;
    setModalType("renew");
    setActivePlayerId(playerId);
    setName(p.name);
    setBirth(p.birth);
    setPhone(p.phone ?? "");
    setBranchId(p.branchId ?? "");
    const endDate = ddmmyyyyToDate(p.end);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let proposed = new Date(today);
    if (endDate) {
      const nextDay = addDays(endDate, 1);
      nextDay.setHours(0, 0, 0, 0);
      proposed = nextDay.getTime() > today.getTime() ? nextDay : today;
    }
    const renewISO = dateToISO(proposed);
    setStartDate(renewISO);
    setStartDateText(isoToDDMMYYYY(renewISO));
    const b = p.branchId ? branchMap.get(p.branchId) : undefined;
    const mode: SubscriptionMode = b?.subscriptionMode ?? p.subscriptionMode ?? "حصص";
    setSubscriptionMode(mode);
    setSessionsInput(mode === "حصص" ? "12" : "0");
    setPriceInput(String(b?.price ?? p.price ?? 0));
    setIsLegacy(p.isLegacy);
    setSaveError(null);
    setOpen(true);
  }

  // Feature B: Extend modal
  function openExtendModal(playerId: string) {
    setModalType("extend");
    setActivePlayerId(playerId);
    setExtendDays(7);
    setSaveError(null);
    setOpen(true);
  }

  // Feature F: History modal — Fix 2: fallback to payments-based synthetic history
  async function openHistoryModal(playerId: string) {
    const p = players.find((x) => x.id === playerId);
    setModalType("history");
    setActivePlayerId(playerId);
    setHistoryPlayerName(p?.name ?? "");
    setHistoryEvents([]);
    setHistoryLoading(true);
    setSaveError(null);
    setOpen(true);
    try {
      const [events, pmts] = await Promise.all([
        listSubscriptionEvents(playerId),
        listPlayerPayments(playerId).catch(() => [] as DbPayment[]),
      ]);

      if (events.length > 0) {
        // Inject synthetic "expired" events from payment gaps into the real event list
        const syntheticExpired: DbSubscriptionEvent[] = [];
        const sortedPmts = [...pmts].sort((a, b) => a.date.localeCompare(b.date));
        for (let i = 0; i < sortedPmts.length - 1; i++) {
          const cur = sortedPmts[i];
          const next = sortedPmts[i + 1];
          if (cur.subscription_end && next) {
            const endDate = isoToDate(cur.subscription_end);
            const nextStart = isoToDate(next.date);
            endDate.setHours(0, 0, 0, 0);
            nextStart.setHours(0, 0, 0, 0);
            const gapDays = Math.round((nextStart.getTime() - endDate.getTime()) / (1000 * 60 * 60 * 24));
            if (gapDays > 1) {
              // Only add if not already present
              const alreadyExists = events.some(
                (ev) => ev.event_type === "expired" && ev.event_date === cur.subscription_end
              );
              if (!alreadyExists) {
                syntheticExpired.push({
                  id: `synth-${cur.id}-expired`,
                  academy_id: "",
                  player_id: playerId,
                  event_type: "expired",
                  event_date: cur.subscription_end,
                  extend_days: null,
                  payment_id: null,
                  note: null,
                  created_by: null,
                  created_at: cur.created_at,
                });
              }
            }
          }
        }
        // Also check if the last payment's subscription has already expired with no renewal
        const lastPmt = sortedPmts[sortedPmts.length - 1];
        const todayStr = new Date().toISOString().slice(0, 10);
        if (lastPmt?.subscription_end && lastPmt.subscription_end < todayStr) {
          const alreadyHasFinalExpired = [...events, ...syntheticExpired].some(
            (ev) => ev.event_type === "expired" && ev.event_date >= lastPmt.subscription_end!
          );
          if (!alreadyHasFinalExpired) {
            syntheticExpired.push({
              id: `synth-${lastPmt.id}-expired-final`,
              academy_id: "",
              player_id: playerId,
              event_type: "expired",
              event_date: lastPmt.subscription_end,
              extend_days: null,
              payment_id: null,
              note: null,
              created_by: null,
              created_at: lastPmt.created_at,
            });
          }
        }

        const merged = [...events, ...syntheticExpired].sort((a, b) =>
          a.event_date.localeCompare(b.event_date)
        );
        setHistoryEvents(merged);
      } else {
        // No events yet (table new or player predates feature) — derive from payments
        setHistoryEvents(buildSyntheticHistory(pmts));
      }
    } catch (e) {
      console.error("[players] history load error:", e);
    } finally {
      setHistoryLoading(false);
    }
  }

  // ── Save (add / edit / renew) ──────────────────────────────────────────────
  async function savePlayer() {
    setSaveError(null);

    if (!name.trim() || !birth.trim() || !branchId) {
      setSaveError("يرجى تعبئة الاسم + سنة الميلاد + الفرع.");
      return;
    }
    if (phone && !/^[0-9+ ]{6,20}$/.test(phone)) {
      setSaveError("رقم الهاتف غير صحيح.");
      return;
    }
    const b = branchMap.get(branchId);
    if (!b) {
      setSaveError("الفرع غير موجود.");
      return;
    }
    const price = Number(priceInput);
    if (!Number.isFinite(price) || price <= 0) {
      setSaveError("سعر الاشتراك غير صحيح.");
      return;
    }

    let sessions = 0;
    let endDateISO: string | null = null;

    if (subscriptionMode === "شهري") {
      sessions = 0;
      endDateISO = computeMonthlyEndISO(startDate);
    } else {
      const s = Number(sessionsInput);
      if (!Number.isFinite(s) || s <= 0) {
        setSaveError("عدد الحصص غير صحيح.");
        return;
      }
      sessions = s;
      if (!b.days || b.days.length === 0) {
        setSaveError("أيام الفرع غير محددة. عدل الفرع وحدد أيام التدريب.");
        return;
      }
      endDateISO = computeSessionsEndISO(startDate, b.days, sessions);
      if (!endDateISO) {
        setSaveError("تعذر حساب تاريخ النهاية.");
        return;
      }
    }

    // Fix 6: in edit mode, preserve the existing end_date unless subscription params changed.
    // This prevents overwriting an extended end_date when only name/phone/price is edited.
    if (modalType === "edit" && originalSubParams && originalEndDateISO) {
      const unchanged =
        originalSubParams.startDate === startDate &&
        originalSubParams.mode === subscriptionMode &&
        originalSubParams.branchId === branchId &&
        originalSubParams.sessions === sessions;
      if (unchanged) {
        endDateISO = originalEndDateISO;
      }
    }

    setSaving(true);
    try {
      if (modalType === "add") {
        const existing = findExistingPlayer(players, { name: name.trim(), birth: birth.trim() });
        if (existing) {
          setSaveError(
            `هذا اللاعب موجود مسبقًا بنفس الاسم وسنة الميلاد: ${existing.name}`
          );
          setSaving(false);
          return;
        }

        const dbPlayer = await createPlayer({
          branch_id: branchId || null,
          name: name.trim(),
          birth: birth.trim(),
          phone: phone.trim(),
          subscription_mode: subscriptionMode,
          sessions,
          price,
          start_date: startDate,
          end_date: endDateISO,
          is_legacy: isLegacy,
        });

        const payment = await createPayment({
          branch_id:        branchId || null,
          player_id:        dbPlayer.id,
          amount:           price,
          kind:             isLegacy ? "legacy" : "new",
          date:             startDate,
          subscription_end: endDateISO,
        });

        // Feature F: create subscription event (best-effort)
        try {
          await createSubscriptionEvent({
            player_id:  dbPlayer.id,
            event_type: "first_registration",
            event_date: startDate,
            payment_id: (payment as DbPayment).id,
          });
        } catch { /* non-critical */ }

        setPlayers((prev) => [dbToPlayer(dbPlayer), ...prev]);
        setOpen(false);
        return;
      }

      if (!activePlayerId) return;

      const dbPlayer = await updatePlayer(activePlayerId, {
        branch_id: branchId || null,
        name: name.trim(),
        birth: birth.trim(),
        phone: phone.trim(),
        subscription_mode: subscriptionMode,
        sessions,
        price,
        start_date: startDate,
        end_date: endDateISO,
        is_legacy: isLegacy,
      });

      setPlayers((prev) =>
        prev.map((p) => (p.id === activePlayerId ? dbToPlayer(dbPlayer) : p))
      );

      // Fix 1: update latest payment amount when price changes (edit mode only)
      if (modalType === "edit") {
        const originalPlayer = players.find((p) => p.id === activePlayerId);
        if (originalPlayer && price !== originalPlayer.price) {
          try {
            const pmts = await listPlayerPayments(activePlayerId);
            if (pmts.length > 0) await updatePayment(pmts[0].id, { amount: price });
          } catch { /* non-critical — Finance page re-syncs on next visit */ }
        }
      }

      if (modalType === "renew") {
        const payment = await createPayment({
          branch_id:        branchId || null,
          player_id:        activePlayerId,
          amount:           price,
          kind:             "renew",
          date:             startDate,
          subscription_end: endDateISO,
        });

        // Feature F: always record as "renewal" (no "returned" concept)
        try {
          await createSubscriptionEvent({
            player_id:  activePlayerId,
            event_type: "renewal",
            event_date: startDate,
            payment_id: (payment as DbPayment).id,
          });
        } catch { /* non-critical */ }
      }

      setOpen(false);
    } catch (e) {
      console.error("[players] save error:", e);
      setSaveError(formatError(e));
    } finally {
      setSaving(false);
    }
  }

  // Feature B: do extend (single player) — Fix 3: session-based + Fix 4b: note with new end_date
  async function doExtend() {
    if (!activePlayerId || extendDays < 1) return;
    const p = players.find((x) => x.id === activePlayerId);
    if (!p) return;
    if (!p.end || p.end === "—") {
      setSaveError("لا يوجد تاريخ انتهاء للتمديد.");
      return;
    }
    const branch = p.branchId ? branchMap.get(p.branchId) : undefined;
    const newEndISO = computeExtendEndISO(p.end, p.subscriptionMode, branch?.days ?? [], extendDays);
    if (!newEndISO) {
      setSaveError("تعذر حساب تاريخ التمديد. تأكد من إعداد أيام الفرع.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await updatePlayer(activePlayerId, { end_date: newEndISO });
      try {
        await createSubscriptionEvent({
          player_id:   activePlayerId,
          event_type:  "extension",
          event_date:  new Date().toISOString().slice(0, 10),
          extend_days: extendDays,
          note:        `ينتهي في: ${isoToDDMMYYYY(newEndISO)}`,
        });
      } catch { /* non-critical */ }
      setPlayers((prev) =>
        prev.map((x) => (x.id === activePlayerId ? dbToPlayer(updated) : x))
      );
      setOpen(false);
    } catch (e) {
      setSaveError(formatError(e));
    } finally {
      setSaving(false);
    }
  }

  // Feature C: pause / resume
  async function doTogglePause(playerId: string) {
    const p = players.find((x) => x.id === playerId);
    if (!p) return;
    setPauseToggling(playerId);
    try {
      const updated = p.isPaused
        ? await resumePlayer(playerId)
        : await pausePlayer(playerId);
      const eventType: SubscriptionEventType = p.isPaused ? "resumed" : "paused";
      try {
        await createSubscriptionEvent({
          player_id:  playerId,
          event_type: eventType,
          event_date: new Date().toISOString().slice(0, 10),
        });
      } catch { /* non-critical */ }
      setPlayers((prev) =>
        prev.map((x) => (x.id === playerId ? dbToPlayer(updated) : x))
      );
    } catch (e) {
      console.error("[players] pause toggle error:", e);
      alert(formatError(e));
    } finally {
      setPauseToggling(null);
    }
  }

  // Feature D: bulk extend — Fix 3: session-based per player
  async function doBulkExtend() {
    const ids = Array.from(selectedIds);
    setBulkProcessing(true);
    setBulkConfirm(null);
    const today = new Date().toISOString().slice(0, 10);
    try {
      for (const id of ids) {
        const p = players.find((x) => x.id === id);
        if (!p || !p.end || p.end === "—") continue;
        const branch = p.branchId ? branchMap.get(p.branchId) : undefined;
        const newEndISO = computeExtendEndISO(p.end, p.subscriptionMode, branch?.days ?? [], bulkExtendDays);
        if (!newEndISO) continue;
        const updated = await updatePlayer(id, { end_date: newEndISO });
        try {
          await createSubscriptionEvent({
            player_id:   id,
            event_type:  "extension",
            event_date:  today,
            extend_days: bulkExtendDays,
            note:        `ينتهي في: ${isoToDDMMYYYY(newEndISO)}`,
          });
        } catch { /* non-critical */ }
        setPlayers((prev) =>
          prev.map((x) => (x.id === id ? dbToPlayer(updated) : x))
        );
      }
      setSelectedIds(new Set());
    } catch (e) {
      console.error("[players] bulk extend error:", e);
      alert(formatError(e));
    } finally {
      setBulkProcessing(false);
    }
  }

  // Feature D: bulk delete
  async function doBulkDelete() {
    const ids = Array.from(selectedIds);
    setBulkProcessing(true);
    setBulkConfirm(null);
    try {
      for (const id of ids) {
        await deletePlayer(id);
        setPlayers((prev) => prev.filter((p) => p.id !== id));
      }
      setSelectedIds(new Set());
    } catch (e) {
      console.error("[players] bulk delete error:", e);
      alert(formatError(e));
    } finally {
      setBulkProcessing(false);
    }
  }

  // ── Filters ────────────────────────────────────────────────────────────────
  const filteredPlayers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return players
      .filter((p) => {
        if (!q) return true;
        return (
          (p.name ?? "").toLowerCase().includes(q) ||
          (p.phone ?? "").toLowerCase().includes(q)
        );
      })
      .filter((p) => {
        const liveStatus = calcStatusFromEnd(p.end, p.isPaused);
        if (activeFilter === "all") return true;
        if (activeFilter === "active") return liveStatus === "نشط";
        if (activeFilter === "ending7") return liveStatus === "قريب";
        if (activeFilter === "expired") return liveStatus === "منتهي";
        return true;
      })
      .filter((p) => {
        if (branchFilter === "all") return true;
        return p.branchId === branchFilter;
      });
  }, [players, searchTerm, activeFilter, branchFilter]);

  const filterButtons: Array<{ key: FilterKey; label: string }> = [
    { key: "all",      label: "جميع اللاعبين" },
    { key: "active",   label: "النشطون" },
    { key: "ending7",  label: "ينتهي خلال 7 أيام" },
    { key: "expired",  label: "المنتهية اشتراكاتهم" },
  ];

  // Select all filtered
  const allFilteredSelected =
    filteredPlayers.length > 0 &&
    filteredPlayers.every((p) => selectedIds.has(p.id));

  function toggleSelectAll() {
    if (allFilteredSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredPlayers.forEach((p) => next.delete(p.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredPlayers.forEach((p) => next.add(p.id));
        return next;
      });
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ── UI ─────────────────────────────────────────────────────────────────────
  return (
    <main className="flex-1 p-4 md:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <h1 className="text-xl md:text-2xl font-semibold">اللاعبين</h1>
        <Link
          href="/players/attendance"
          className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs md:text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
        >
          📋 سجل الحضور
        </Link>
      </div>

      {/* Page-level error */}
      {pageError && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {pageError}
          <button
            onClick={loadData}
            className="mr-3 underline text-red-300 hover:text-red-200"
            type="button"
          >
            إعادة المحاولة
          </button>
        </div>
      )}

      {/* Control Bar */}
      <div className="bg-[#111827] rounded-2xl p-4 space-y-3">
        {/* Row 1: Search + Branch filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full sm:flex-1 h-11 rounded-xl bg-[#0F172A] border border-white/10 px-4 text-white outline-none focus:border-white/25"
            placeholder="ابحث بالاسم أو رقم ولي الأمر…"
          />
          <select
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            className="w-full sm:w-[220px] h-11 rounded-xl bg-[#0F172A] border border-white/10 px-4 text-white outline-none focus:border-white/25"
          >
            <option value="all">كل الفروع (الأكاديمية)</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        {/* Row 2: Status filter chips */}
        <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
          {filterButtons.map((btn) => {
            const isActive = activeFilter === btn.key;
            return (
              <button
                key={btn.key}
                onClick={() => setActiveFilter(btn.key)}
                className={[
                  "shrink-0 h-9 px-4 rounded-full text-sm transition",
                  isActive
                    ? "bg-white/10 text-white"
                    : "bg-[#0F172A] text-white/70 hover:bg-white/5 hover:text-white",
                ].join(" ")}
                type="button"
              >
                {btn.label}
              </button>
            );
          })}
        </div>

        {/* Row 3: Actions */}
        <div className="flex items-center gap-3 flex-wrap">
          <Button onClick={openAddModal} disabled={loading}>
            + إضافة لاعب
          </Button>

          {!loading && branches.length === 0 && (
            <div className="text-xs text-amber-200/90">
              لا يوجد فروع بعد — أضف فرعًا من صفحة الفروع أولاً.
            </div>
          )}

          <div className="text-xs text-white/50">
            عدد النتائج:{" "}
            <span className="text-white">{filteredPlayers.length}</span>
          </div>

          <Button
            variant="secondary"
            onClick={() => printPlayers(filteredPlayers)}
            disabled={loading}
          >
            🖨️ طباعة القائمة
          </Button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="mt-6 text-white/60 text-sm px-2">
          جاري التحميل...
        </div>
      )}

      {!loading && (
        <>
          {/* ── Mobile card list (hidden on md+) ─────────────────────────── */}
          <div className="mt-4 md:hidden space-y-3">
            {filteredPlayers.length === 0 ? (
              <div className="py-8 text-center text-sm text-white/60">
                لا توجد نتائج مطابقة.
              </div>
            ) : (
              filteredPlayers.map((r) => {
                const b = r.branchId ? branchMap.get(r.branchId) : undefined;
                const branchName = b?.name ?? "—";
                const liveStatus = calcStatusFromEnd(r.end, r.isPaused);
                const sessionsLabel =
                  r.subscriptionMode === "شهري"
                    ? "شهري"
                    : String(remainingSessions(r, b) ?? r.sessions);
                const isSelected = selectedIds.has(r.id);
                const isPauseLoading = pauseToggling === r.id;

                return (
                  <div
                    key={r.id}
                    className={[
                      "bg-[#111827] rounded-2xl p-4 border transition",
                      isSelected ? "border-[#63C0B0]/40" : "border-white/5",
                    ].join(" ")}
                  >
                    {/* Card header */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-start gap-2 min-w-0 flex-1">
                        {/* Checkbox */}
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(r.id)}
                          className="mt-0.5 h-4 w-4 rounded shrink-0"
                          aria-label={`تحديد ${r.name}`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-sm flex items-center gap-2 flex-wrap">
                            {r.name}
                            {r.isLegacy && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-500/15 text-amber-300">
                                قديم
                              </span>
                            )}
                            {r.isPaused && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] bg-blue-500/15 text-blue-400">
                                تجميد
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-white/50 mt-0.5">{branchName}</div>
                        </div>
                      </div>
                      <span
                        className={`shrink-0 mr-2 px-3 py-1 rounded-full text-xs ${statusStyles[liveStatus]}`}
                      >
                        {liveStatus}
                      </span>
                    </div>

                    {/* Card details grid */}
                    <div className="grid grid-cols-2 gap-y-1.5 text-xs mb-3">
                      <div>
                        <span className="text-white/40">سنة الميلاد: </span>
                        <span className="text-white/80">{r.birth}</span>
                      </div>
                      <div>
                        <span className="text-white/40">الهاتف: </span>
                        <span className="text-white/80">{r.phone || "—"}</span>
                      </div>
                      <div>
                        <span className="text-white/40">الحصص: </span>
                        <span className="text-white/80">{sessionsLabel}</span>
                      </div>
                      <div>
                        <span className="text-white/40">السعر: </span>
                        <span className="text-white/80">{r.price} د.ك</span>
                      </div>
                      <div>
                        <span className="text-white/40">البداية: </span>
                        <span className="text-white/80">{r.start}</span>
                      </div>
                      <div>
                        <span className="text-white/40">الانتهاء: </span>
                        <span className="text-white/80">{r.end}</span>
                      </div>
                    </div>

                    {/* Card actions */}
                    <div className="flex gap-2 pt-2.5 border-t border-white/5 flex-wrap">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditModal(r.id)}
                      >
                        تعديل
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => openRenewModal(r.id)}
                      >
                        تجديد
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => openExtendModal(r.id)}
                      >
                        تمديد
                      </Button>
                      <button
                        type="button"
                        title={r.isPaused ? "استئناف الاشتراك" : "إيقاف الاشتراك مؤقتاً"}
                        disabled={isPauseLoading}
                        onClick={() => doTogglePause(r.id)}
                        className="h-8 px-2 rounded-lg text-xs border border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white transition disabled:opacity-40"
                      >
                        {isPauseLoading ? "..." : r.isPaused ? "▶" : "⏸"}
                      </button>
                      <button
                        type="button"
                        title="سجل التسجيل"
                        onClick={() => openHistoryModal(r.id)}
                        className="h-8 px-2 rounded-lg text-xs border border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white transition"
                      >
                        📋
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* ── Desktop table (hidden on mobile) ─────────────────────────── */}
          <div className="mt-6 hidden md:block bg-[#111827] rounded-2xl overflow-hidden border border-white/5">
            <div className="bg-[#0F172A] px-6 py-4 text-sm text-white/80 grid grid-cols-[0.4fr_2fr_0.9fr_1.2fr_1.2fr_0.9fr_1fr_1.1fr_1.1fr_0.9fr_2.5fr] gap-4">
              {/* Select all */}
              <div className="flex items-center justify-center">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded"
                  aria-label="تحديد الجميع"
                />
              </div>
              <div>الاسم</div>
              <div>سنة الميلاد</div>
              <div>هاتف ولي الأمر</div>
              <div>الفرع</div>
              <div>الحصص المتبقية</div>
              <div>السعر</div>
              <div>تاريخ البداية</div>
              <div>ينتهي في</div>
              <div>الحالة</div>
              <div className="text-center">الإجراء</div>
            </div>

            <div>
              {filteredPlayers.map((r, idx) => {
                const zebra =
                  idx % 2 === 0 ? "bg-[#0B1220]" : "bg-[#0E1A2B]";
                const b = r.branchId ? branchMap.get(r.branchId) : undefined;
                const branchName = b?.name ?? "—";
                const liveStatus = calcStatusFromEnd(r.end, r.isPaused);
                const sessionsLabel =
                  r.subscriptionMode === "شهري"
                    ? "شهري"
                    : String(remainingSessions(r, b) ?? r.sessions);
                const isSelected = selectedIds.has(r.id);
                const isPauseLoading = pauseToggling === r.id;

                return (
                  <div
                    key={r.id}
                    className={[
                      zebra,
                      "px-6 py-4 grid grid-cols-[0.4fr_2fr_0.9fr_1.2fr_1.2fr_0.9fr_1fr_1.1fr_1.1fr_0.9fr_2.5fr] gap-4 items-center",
                      isSelected ? "ring-1 ring-inset ring-[#63C0B0]/30" : "",
                    ].join(" ")}
                  >
                    {/* Checkbox */}
                    <div className="flex items-center justify-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(r.id)}
                        className="h-4 w-4 rounded"
                        aria-label={`تحديد ${r.name}`}
                      />
                    </div>
                    <div className="font-medium flex items-center gap-2 flex-wrap">
                      {r.name}
                      {r.isLegacy && (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] bg-amber-500/15 text-amber-300">
                          قديم
                        </span>
                      )}
                      {r.isPaused && (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] bg-blue-500/15 text-blue-400">
                          تجميد
                        </span>
                      )}
                    </div>
                    <div className="text-white/80">{r.birth}</div>
                    <div className="text-white/80">{r.phone || "—"}</div>
                    <div className="text-white/80">{branchName}</div>
                    <div className="text-white/80">{sessionsLabel}</div>
                    <div className="text-white/80">{r.price} د.ك</div>
                    <div className="text-white/80">{r.start}</div>
                    <div className="text-white/80">{r.end}</div>
                    <div>
                      <span
                        className={`inline-flex px-3 py-1 rounded-full text-xs ${statusStyles[liveStatus]}`}
                      >
                        {liveStatus}
                      </span>
                    </div>
                    <div className="flex gap-1.5 justify-center flex-wrap">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditModal(r.id)}
                      >
                        تعديل
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => openRenewModal(r.id)}
                      >
                        تجديد
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => openExtendModal(r.id)}
                      >
                        تمديد
                      </Button>
                      <button
                        type="button"
                        title={r.isPaused ? "استئناف الاشتراك" : "إيقاف الاشتراك مؤقتاً"}
                        disabled={isPauseLoading}
                        onClick={() => doTogglePause(r.id)}
                        className="h-8 px-2 rounded-lg text-xs border border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white transition disabled:opacity-40"
                      >
                        {isPauseLoading ? "..." : r.isPaused ? "▶" : "⏸"}
                      </button>
                      <button
                        type="button"
                        title="سجل التسجيل"
                        onClick={() => openHistoryModal(r.id)}
                        className="h-8 px-2 rounded-lg text-xs border border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white transition"
                      >
                        📋
                      </button>
                    </div>
                  </div>
                );
              })}

              {filteredPlayers.length === 0 && (
                <div className="p-6 text-sm text-white/60">
                  لا توجد نتائج مطابقة.
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Feature D: Floating bulk action bar ──────────────────────────── */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 inset-x-0 flex justify-center z-40 pointer-events-none px-4">
          <div className="pointer-events-auto bg-[#111827] border border-white/20 rounded-2xl px-4 py-3 shadow-2xl flex flex-wrap items-center gap-3">
            <span className="text-sm text-white/70 shrink-0">
              تم تحديد {selectedIds.size} لاعب
            </span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                value={bulkExtendDays}
                onChange={(e) => setBulkExtendDays(Math.max(1, Number(e.target.value) || 1))}
                className="w-16 h-8 rounded-lg bg-[#0F172A] border border-white/10 px-2 text-xs text-white outline-none"
                aria-label="عدد أيام التمديد"
              />
              <span className="text-xs text-white/50 shrink-0">يوم</span>
            </div>
            <button
              type="button"
              onClick={() => setBulkConfirm("extend")}
              disabled={bulkProcessing}
              className="rounded-xl bg-[#63C0B0]/20 border border-[#63C0B0]/40 px-4 py-2 text-xs font-semibold text-[#63C0B0] hover:bg-[#63C0B0]/30 transition disabled:opacity-50"
            >
              تمديد
            </button>
            <button
              type="button"
              onClick={() => setBulkConfirm("delete")}
              disabled={bulkProcessing}
              className="rounded-xl bg-red-500/20 border border-red-500/40 px-4 py-2 text-xs font-semibold text-red-300 hover:bg-red-500/30 transition disabled:opacity-50"
            >
              حذف
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              disabled={bulkProcessing}
              className="rounded-xl bg-white/5 border border-white/15 px-4 py-2 text-xs text-white/60 hover:bg-white/10 hover:text-white transition disabled:opacity-50"
            >
              إلغاء التحديد
            </button>
          </div>
        </div>
      )}

      {/* ── Feature D: Bulk confirmation dialog ──────────────────────────── */}
      {bulkConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#111827] border border-white/10 rounded-2xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold mb-3">تأكيد</h3>
            <p className="text-sm text-white/70 mb-6">
              {bulkConfirm === "delete"
                ? `هل أنت متأكد؟ سيتم حذف ${selectedIds.size} لاعبين نهائياً`
                : `سيتم تمديد اشتراك ${selectedIds.size} لاعبين بـ ${bulkExtendDays} يوم`}
            </p>
            <div className="flex gap-3">
              <Button
                variant="secondary"
                onClick={() => setBulkConfirm(null)}
                disabled={bulkProcessing}
              >
                إلغاء
              </Button>
              <Button
                variant={bulkConfirm === "delete" ? "danger" : "primary"}
                onClick={bulkConfirm === "delete" ? doBulkDelete : doBulkExtend}
                disabled={bulkProcessing}
              >
                {bulkProcessing ? "جاري التنفيذ..." : "تأكيد"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main modal (add / edit / renew / extend / history) ───────────── */}
      {open && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
          <div className="w-full sm:max-w-xl bg-[#0F172A] border border-white/10 rounded-t-2xl sm:rounded-2xl p-5 max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="font-semibold">
                {modalType === "add"     && "إضافة لاعب"}
                {modalType === "edit"    && "تعديل لاعب"}
                {modalType === "renew"   && "تجديد اشتراك"}
                {modalType === "extend"  && `تمديد اشتراك — ${players.find(p => p.id === activePlayerId)?.name ?? ""}`}
                {modalType === "history" && `سجل التسجيل — ${historyPlayerName}`}
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-white/70 hover:text-white"
                type="button"
              >
                ✕
              </button>
            </div>

            {/* Save error */}
            {saveError && (
              <div className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
                {saveError}
              </div>
            )}

            {/* ── Extend modal body (Feature B) ─────────────────────────── */}
            {modalType === "extend" && (() => {
              const activeP = players.find((x) => x.id === activePlayerId);
              const isSessionMode = activeP?.subscriptionMode === "حصص";
              const branch = activeP?.branchId ? branchMap.get(activeP.branchId) : undefined;
              const newEndISO = activeP && activeP.end && activeP.end !== "—"
                ? computeExtendEndISO(activeP.end, activeP.subscriptionMode, branch?.days ?? [], extendDays)
                : null;
              return (
                <div>
                  <div className="text-sm text-white/70 mb-4">
                    {isSessionMode
                      ? "أدخل عدد الحصص الإضافية التي تريد إضافتها إلى نهاية الاشتراك."
                      : "أدخل عدد الأيام التي تريد إضافتها إلى نهاية الاشتراك الحالي."}
                  </div>
                  <div className="mb-5">
                    <div className="text-xs text-white/70 mb-1">
                      {isSessionMode ? "عدد الحصص" : "عدد الأيام"}
                    </div>
                    <input
                      type="number"
                      min="1"
                      value={extendDays}
                      onChange={(e) => setExtendDays(Math.max(1, Number(e.target.value) || 1))}
                      className="w-full h-11 rounded-xl bg-[#0B1220] border border-white/10 px-4 text-white outline-none focus:border-white/25"
                    />
                  </div>
                  {activeP && activeP.end && activeP.end !== "—" && (
                    <div className="mb-5 text-xs text-white/60">
                      تاريخ الانتهاء الحالي:{" "}
                      <span className="text-white">{activeP.end}</span>
                      {newEndISO && (
                        <>
                          {" → "}
                          <span className="text-[#63C0B0]">{isoToDDMMYYYY(newEndISO)}</span>
                        </>
                      )}
                    </div>
                  )}
                  <div className="flex gap-3">
                    <Button variant="secondary" onClick={() => setOpen(false)}>إلغاء</Button>
                    <Button onClick={doExtend} disabled={saving}>
                      {saving ? "جاري الحفظ..." : "تمديد"}
                    </Button>
                  </div>
                </div>
              );
            })()}

            {/* ── History modal body (Feature F) ───────────────────────── */}
            {modalType === "history" && (
              <div>
                {historyLoading && (
                  <div className="py-8 text-center text-sm text-white/40">
                    جاري التحميل...
                  </div>
                )}
                {!historyLoading && historyEvents.length === 0 && (
                  <div className="py-8 text-center text-sm text-white/40">
                    لا يوجد سجل لهذا اللاعب.
                    <div className="mt-2 text-[11px] text-white/25">
                      لا توجد دفعات مسجلة لهذا اللاعب.
                    </div>
                  </div>
                )}
                {!historyLoading && historyEvents.length > 0 && (
                  <div className="space-y-2">
                    {historyEvents.map((ev) => {
                      const cfg = EVENT_CONFIG[ev.event_type] ?? {
                        label: ev.event_type,
                        color: "bg-white/10 text-white/60 border-white/15",
                      };
                      return (
                        <div
                          key={ev.id}
                          className="flex items-start gap-3 p-3 rounded-xl bg-white/3 border border-white/8"
                        >
                          <div className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${cfg.color}`}>
                            {cfg.label}
                            {ev.event_type === "extension" && ev.extend_days
                              ? ` (+${ev.extend_days})`
                              : ""}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-white/50">
                              {ev.event_date}
                            </div>
                            {ev.note && (
                              <div className="text-xs text-white/40 mt-0.5 truncate">
                                {ev.note}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="mt-4">
                  <Button variant="secondary" onClick={() => setOpen(false)}>إغلاق</Button>
                </div>
              </div>
            )}

            {/* ── Add / Edit / Renew modal body ────────────────────────── */}
            {(modalType === "add" || modalType === "edit" || modalType === "renew") && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Name */}
                  <div className="col-span-full">
                    <div className="text-xs text-white/70 mb-1">الاسم</div>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full h-11 rounded-xl bg-[#0B1220] border border-white/10 px-4 outline-none"
                      placeholder="اسم اللاعب"
                    />
                  </div>

                  {/* Birth */}
                  <div>
                    <div className="text-xs text-white/70 mb-1">سنة الميلاد</div>
                    <input
                      value={birth}
                      onChange={(e) => setBirth(e.target.value)}
                      className="w-full h-11 rounded-xl bg-[#0B1220] border border-white/10 px-4 outline-none"
                      placeholder="مثال: 2016"
                    />
                  </div>

                  {/* Phone */}
                  <div>
                    <div className="text-xs text-white/70 mb-1">هاتف ولي الأمر</div>
                    <input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full h-11 rounded-xl bg-[#0B1220] border border-white/10 px-4 outline-none"
                      placeholder="مثال: 99999999"
                    />
                  </div>

                  {/* Branch */}
                  <div className="col-span-full">
                    <div className="text-xs text-white/70 mb-1">الفرع</div>
                    <select
                      value={branchId}
                      onChange={(e) => applyBranchSettings(e.target.value)}
                      className="w-full h-11 rounded-xl bg-[#0B1220] border border-white/10 px-4 outline-none"
                      disabled={modalType === "renew"}
                    >
                      <option value="">اختر الفرع</option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Start Date */}
                  <div className="col-span-full">
                    <div className="text-xs text-white/70 mb-1">تاريخ البداية</div>
                    <input
                      type="text"
                      value={startDateText}
                      onChange={(e) => handleStartDateTextChange(e.target.value)}
                      placeholder="يوم/شهر/سنة  —  مثال: 26/02/2026"
                      maxLength={10}
                      className="w-full h-11 rounded-xl bg-[#0B1220] border border-white/10 px-4 outline-none"
                      dir="ltr"
                    />
                  </div>

                  {/* Subscription mode */}
                  <div className="col-span-full">
                    <div className="text-xs text-white/70 mb-1">نوع الاشتراك</div>
                    <div className="flex gap-2">
                      {(["حصص", "شهري"] as SubscriptionMode[]).map((m) => (
                        <button
                          key={m}
                          onClick={() => setSubscriptionMode(m)}
                          className={[
                            "h-10 px-4 rounded-xl text-sm border transition",
                            subscriptionMode === m
                              ? "bg-white/10 border-white/15"
                              : "bg-[#0B1220] border-white/10 hover:bg-white/5",
                          ].join(" ")}
                          type="button"
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Sessions */}
                  {subscriptionMode === "حصص" && (
                    <div>
                      <div className="text-xs text-white/70 mb-1">عدد الحصص</div>
                      <input
                        value={sessionsInput}
                        onChange={(e) => setSessionsInput(e.target.value)}
                        className="w-full h-11 rounded-xl bg-[#0B1220] border border-white/10 px-4 outline-none"
                        placeholder="مثال: 12"
                      />
                    </div>
                  )}

                  {/* Price */}
                  <div>
                    <div className="text-xs text-white/70 mb-1">السعر (د.ك)</div>
                    <input
                      value={priceInput}
                      onChange={(e) => setPriceInput(e.target.value)}
                      className="w-full h-11 rounded-xl bg-[#0B1220] border border-white/10 px-4 outline-none"
                      placeholder="مثال: 40"
                    />
                  </div>

                  {/* is_legacy */}
                  <div className="col-span-full">
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={isLegacy}
                        onChange={(e) => setIsLegacy(e.target.checked)}
                        className="h-4 w-4 rounded"
                      />
                      <span className="text-sm text-white/80">
                        لاعب قديم
                        <span className="text-white/40 text-xs mr-2">
                          (لا يُحتسب في تحليلات اللاعبين الجدد)
                        </span>
                      </span>
                    </label>
                  </div>

                  {/* End preview */}
                  <div className="col-span-full text-xs text-white/70">
                    تاريخ النهاية المتوقع:{" "}
                    <span className="text-white">{computeEndPreview()}</span>
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-between gap-3">
                  <Button variant="secondary" onClick={() => setOpen(false)}>
                    إلغاء
                  </Button>
                  <Button onClick={savePlayer} disabled={saving}>
                    {saving ? "جاري الحفظ..." : "حفظ"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
