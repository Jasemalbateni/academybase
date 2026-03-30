/**
 * Pure utility functions for the Players page.
 * No React state, no side effects — safe to unit-test in isolation.
 */

import type { DbPlayer } from "@/src/lib/supabase/players";
import type { DbBranch } from "@/src/lib/supabase/branches";
import type { DbPayment } from "@/src/lib/supabase/payments";
import type { DbSubscriptionEvent, SubscriptionEventType } from "@/src/lib/supabase/subscription-events";
import {
  isoToDDMMYYYY,
  ddmmyyyyToISO,
  isoToDate,
  dateToISO,
  ddmmyyyyToDate,
  formatDDMMYYYYFromDate,
  addDays,
  addMonthsClamped,
  AR_DAY_TO_JS,
} from "@/src/lib/utils";
import type { Player, BranchLite, Status, SubscriptionMode } from "./_types";

// ── DB → UI mappers ────────────────────────────────────────────────────────────

export function dbToPlayer(db: DbPlayer): Player {
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
    avatarUrl: db.avatar_url ?? null,
  };
}

export function dbToBranchLite(db: DbBranch): BranchLite {
  return {
    id: db.id,
    name: db.name,
    price: db.price,
    days: db.days,
    subscriptionMode: db.subscription_mode as SubscriptionMode,
  };
}

// ── End date computation ───────────────────────────────────────────────────────

export function computeMonthlyEnd(startISO: string): string {
  const start = isoToDate(startISO);
  return formatDDMMYYYYFromDate(addDays(addMonthsClamped(start, 1), -1));
}

export function computeMonthlyEndISO(startISO: string): string {
  return ddmmyyyyToISO(computeMonthlyEnd(startISO));
}

export function computeSessionsEnd(
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

export function computeSessionsEndISO(
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
export function computeExtendEndISO(
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

// ── Remaining sessions (estimated) ────────────────────────────────────────────

export function countUsedSessionsSinceStart(
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

export function remainingSessions(
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

// ── Status helpers ─────────────────────────────────────────────────────────────

export function daysUntilEnd(end: string): number | null {
  if (!end || end === "—") return null;
  const endDate = ddmmyyyyToDate(end);
  if (!endDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  endDate.setHours(0, 0, 0, 0);
  return Math.floor((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function calcStatusFromEnd(end: string, isPaused = false): Status {
  if (isPaused) return "تجميد";
  const diff = daysUntilEnd(end);
  if (diff === null) return "نشط";
  if (diff < 0) return "منتهي";
  if (diff <= 7) return "قريب";
  return "نشط";
}

// ── Duplicate check ────────────────────────────────────────────────────────────

export function normalizeName(s: string) {
  return (s || "").trim().toLowerCase();
}

export function findExistingPlayer(
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

// ── Subscription history builder ───────────────────────────────────────────────

/**
 * Build a synthetic event timeline from payment records.
 * Used as history fallback when subscription_events table is empty for a player.
 */
export function buildSyntheticHistory(payments: DbPayment[]): DbSubscriptionEvent[] {
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

// ── Print ──────────────────────────────────────────────────────────────────────

export function printPlayers(
  list: Player[],
  branchFilter: string,
  branchMap: Map<string, BranchLite>
) {
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
