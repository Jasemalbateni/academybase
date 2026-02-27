"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/app/components/ui/Button";
import {
  type DbPlayer,
  listPlayers,
  createPlayer,
  updatePlayer,
} from "@/src/lib/supabase/players";
import { createPayment } from "@/src/lib/supabase/payments";
import {
  type DbBranch,
  listBranches,
} from "@/src/lib/supabase/branches";

// ── Error helper (PostgrestError is NOT instanceof Error) ──────────────────
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
type Status = "نشط" | "قريب" | "منتهي";
type SubscriptionMode = "حصص" | "شهري";
type FilterKey = "all" | "active" | "ending7" | "expired";
type ModalType = "add" | "edit" | "renew";

// Frontend Player – dates stored as DD/MM/YYYY for display compatibility
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
  نشط: "bg-green-500/15 text-green-400",
  قريب: "bg-amber-500/15 text-amber-300",
  منتهي: "bg-red-500/15 text-red-400",
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
function calcStatusFromEnd(end: string): Status {
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
  const [startDate, setStartDate] = useState(todayISO);        // ISO YYYY-MM-DD (internal)
  const [startDateText, setStartDateText] = useState(() =>     // DD/MM/YYYY (display)
    isoToDDMMYYYY(new Date().toISOString().slice(0, 10))
  );
  const [subscriptionMode, setSubscriptionMode] = useState<SubscriptionMode>("حصص");
  const [sessionsInput, setSessionsInput] = useState<string>("12");
  const [priceInput, setPriceInput] = useState<string>("0");
  const [isLegacy, setIsLegacy] = useState(false);

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

  // ── Start date text-input handler (DD/MM/YYYY ↔ ISO) ─────────────────────
  function handleStartDateTextChange(text: string) {
    setStartDateText(text);
    // Convert to ISO as soon as the user finishes a valid DD/MM/YYYY date
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
        const liveStatus = calcStatusFromEnd(p.end);
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
    setSubscriptionMode(p.subscriptionMode);
    setSessionsInput(
      String(p.subscriptionMode === "حصص" ? p.sessions : 0)
    );
    setPriceInput(String(p.price ?? 0));
    setIsLegacy(p.isLegacy);
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
    // start date = max(today, end+1)
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

  // ── Save ───────────────────────────────────────────────────────────────────
  async function savePlayer() {
    setSaveError(null);

    // Validation
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

    // Compute end date
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

    setSaving(true);
    try {
      if (modalType === "add") {
        // Duplicate check
        const existing = findExistingPlayer(players, { name: name.trim(), birth: birth.trim() });
        if (existing) {
          setSaveError(
            `هذا اللاعب موجود مسبقًا بنفس الاسم وسنة الميلاد: ${existing.name}`
          );
          setSaving(false);
          return;
        }

        // Create player
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

        // Create payment record (subscription_end stored for full period history)
        // Legacy players use kind:"legacy" so they're excluded from "new this month" analytics
        await createPayment({
          branch_id:        branchId || null,
          player_id:        dbPlayer.id,
          amount:           price,
          kind:             isLegacy ? "legacy" : "new",
          date:             startDate,
          subscription_end: endDateISO,
        });

        setPlayers((prev) => [dbToPlayer(dbPlayer), ...prev]);
        setOpen(false);
        return;
      }

      // edit / renew
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

      // Renewal creates a payment record (subscription_end stored for full period history)
      if (modalType === "renew") {
        await createPayment({
          branch_id:        branchId || null,
          player_id:        activePlayerId,
          amount:           price,
          kind:             "renew",
          date:             startDate,
          subscription_end: endDateISO,
        });
      }

      setOpen(false);
    } catch (e) {
      console.error("[players] save error:", e);
      setSaveError(formatError(e));
    } finally {
      setSaving(false);
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
        const liveStatus = calcStatusFromEnd(p.end);
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
    { key: "all", label: "جميع اللاعبين" },
    { key: "active", label: "النشطون" },
    { key: "ending7", label: "ينتهي خلال 7 أيام" },
    { key: "expired", label: "المنتهية اشتراكاتهم" },
  ];

  // ── UI ─────────────────────────────────────────────────────────────────────
  return (
    <main className="flex-1 p-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">اللاعبين</h1>
          <Link
            href="/players/attendance"
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
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
        <div className="bg-[#111827] rounded-2xl p-4 space-y-4">
          <div className="flex items-center gap-4 flex-wrap">
            {/* Search */}
            <div className="flex-1 min-w-[260px]">
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-11 rounded-xl bg-[#0F172A] border border-white/10 px-4 text-white outline-none focus:border-white/25"
                placeholder="ابحث بالاسم أو رقم ولي الأمر…"
              />
            </div>

            {/* Branch Filter */}
            <div className="min-w-[220px]">
              <select
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
                className="w-full h-11 rounded-xl bg-[#0F172A] border border-white/10 px-4 text-white outline-none focus:border-white/25"
              >
                <option value="all">كل الفروع (الأكاديمية)</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Status Filters */}
            <div className="flex items-center gap-2 flex-wrap">
              {filterButtons.map((btn) => {
                const active = activeFilter === btn.key;
                return (
                  <button
                    key={btn.key}
                    onClick={() => setActiveFilter(btn.key)}
                    className={[
                      "h-9 px-4 rounded-full text-sm transition",
                      active
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
          </div>

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

        {/* Table */}
        {!loading && (
          <div className="mt-6 bg-[#111827] rounded-2xl overflow-hidden border border-white/5">
            <div className="bg-[#0F172A] px-6 py-4 text-sm text-white/80 grid grid-cols-[2fr_0.9fr_1.2fr_1.2fr_0.9fr_1fr_1.1fr_1.1fr_0.9fr_1.8fr] gap-4">
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
                const liveStatus = calcStatusFromEnd(r.end);
                const sessionsLabel =
                  r.subscriptionMode === "شهري"
                    ? "شهري"
                    : String(remainingSessions(r, b) ?? r.sessions);

                return (
                  <div
                    key={r.id}
                    className={`${zebra} px-6 py-4 grid grid-cols-[2fr_0.9fr_1.2fr_1.2fr_0.9fr_1fr_1.1fr_1.1fr_0.9fr_1.8fr] gap-4 items-center`}
                  >
                    <div className="font-medium flex items-center gap-2">
                      {r.name}
                      {r.isLegacy && (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] bg-amber-500/15 text-amber-300">
                          قديم
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
                    <div className="flex gap-2 justify-center">
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
        )}

        {/* Modal */}
        {open && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
            <div className="w-full max-w-xl bg-[#0F172A] border border-white/10 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="font-semibold">
                  {modalType === "add" && "إضافة لاعب"}
                  {modalType === "edit" && "تعديل لاعب"}
                  {modalType === "renew" && "تجديد اشتراك"}
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

              <div className="grid grid-cols-2 gap-3">
                {/* Name */}
                <div className="col-span-2">
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
                <div className="col-span-2">
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
                <div className="col-span-2">
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
                <div className="col-span-2">
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

                {/* is_legacy checkbox */}
                <div className="col-span-2">
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
                <div className="col-span-2 text-xs text-white/70">
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
            </div>
          </div>
        )}
      </main>
  );
}
