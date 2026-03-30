"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listPlayers, type DbPlayer } from "@/src/lib/supabase/players";
import { listBranches, type DbBranch } from "@/src/lib/supabase/branches";
import {
  listAttendanceByMonth,
  upsertAttendance,
} from "@/src/lib/supabase/attendance";
import { listPaymentPeriods, type PaymentPeriod } from "@/src/lib/supabase/payments";
import { listCalendarEvents } from "@/src/lib/supabase/calendar";
import { createClient } from "@/lib/supabase/browser";
import { formatError } from "@/src/lib/utils";

// ── Arabic day mapping ────────────────────────────────────────────────────────
// JavaScript getDay(): 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat

const JS_DAY_TO_ARABIC: Record<number, string> = {
  0: "الأحد", 1: "الاثنين", 2: "الثلاثاء",
  3: "الأربعاء", 4: "الخميس", 5: "الجمعة", 6: "السبت",
};

const DAY_SHORT: Record<string, string> = {
  "الأحد":    "أحد",  "الاثنين":  "اثن",  "الثلاثاء": "ثلا",
  "الأربعاء": "أرب",  "الخميس":   "خمي",  "الجمعة":   "جمع",  "السبت":    "سبت",
};

// Arabic day name → JS getDay() number (for session-end computation)
const ARABIC_DAY_TO_JS: Record<string, number> = {
  "الأحد": 0, "الاثنين": 1, "الثلاثاء": 2,
  "الأربعاء": 3, "الخميس": 4, "الجمعة": 5, "السبت": 6,
};

// ── Date helpers ──────────────────────────────────────────────────────────────

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function firstDayOfMonth(ym: string): string { return `${ym}-01`; }
function lastDayOfMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
}

/** Local-timezone ISO date — avoids UTC day-shift on UTC+ systems. */
function toISODate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, "0");
  const dd   = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** All dates in the given month whose weekday matches the branch training days. */
function getSessionDates(year: number, month: number, branchDays: string[]): Date[] {
  const dates: Date[] = [];
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month - 1, day);
    if (branchDays.includes(JS_DAY_TO_ARABIC[d.getDay()])) dates.push(d);
  }
  return dates;
}

// ── Subscription period end-date computation (for legacy NULL-end rows) ───────

/** Last inclusive day of a 1-calendar-month subscription starting on startISO. */
function computeMonthlyEndISO(startISO: string): string {
  const [y, m, d] = startISO.split("-").map(Number);
  const nextFirst   = new Date(y, m, 1);
  const lastOfNext  = new Date(nextFirst.getFullYear(), nextFirst.getMonth() + 1, 0).getDate();
  const dayOfMonth  = Math.min(d, lastOfNext);
  const sameNextDay = new Date(nextFirst.getFullYear(), nextFirst.getMonth(), dayOfMonth);
  sameNextDay.setDate(sameNextDay.getDate() - 1);
  return toISODate(sameNextDay);
}

function computeSessionsEndISO(
  startISO:  string,
  branchDays: string[],
  sessions:  number,
): string | null {
  const [y, m, d] = startISO.split("-").map(Number);
  const dayNums   = new Set(
    branchDays.map((name) => ARABIC_DAY_TO_JS[name]).filter((n) => n !== undefined)
  );
  if (dayNums.size === 0 || !Number.isFinite(sessions) || sessions <= 0) return null;

  let count  = 0;
  const cursor = new Date(y, m - 1, d);
  for (let i = 0; i < 365; i++) {
    if (dayNums.has(cursor.getDay())) {
      count += 1;
      if (count === sessions) return toISODate(cursor);
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return null;
}

// ── Subscription state per date ───────────────────────────────────────────────

type SubscriptionPeriod = {
  start: string;        // ISO YYYY-MM-DD
  end:   string | null; // ISO YYYY-MM-DD — null = open-ended (no expiry)
};

export type DateState = "active" | "not_subscribed" | "expired";

function getDateState(
  dateISO: string,
  periods: SubscriptionPeriod[],
): DateState {
  if (periods.length === 0) return "not_subscribed";
  if (dateISO < periods[0].start) return "not_subscribed";
  for (const p of periods) {
    if (dateISO >= p.start && (!p.end || dateISO <= p.end)) return "active";
  }
  return "expired";
}

function isActiveInMonth(
  periods:       SubscriptionPeriod[],
  selectedMonth: string,
): boolean {
  if (periods.length === 0) return false;

  const [year, month] = selectedMonth.split("-").map(Number);
  const firstDayISO   = `${selectedMonth}-01`;
  const lastDay       = new Date(year, month, 0).getDate();
  const lastDayISO    = `${selectedMonth}-${String(lastDay).padStart(2, "0")}`;

  for (const p of periods) {
    if (p.start > lastDayISO)           continue;
    if (p.end && p.end < firstDayISO)   continue;
    return true;
  }
  return false;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Player = {
  id:               string;
  name:             string;
  phone:            string;
  branchId:         string | null;
  subscriptionMode: string;
  sessions:         number;
  startDate:        string;
  endDate:          string | null;
  isPaused:         boolean;  // Feature C
};

type BranchLite = {
  id:   string;
  name: string;
  days: string[];
};

type DateEntry = {
  date:  Date;
  iso:   string;
  state: DateState;
};

type AttendanceMap = Map<string, boolean>; // "playerId-YYYY-MM-DD" → present

function attKey(playerId: string, isoDate: string): string {
  return `${playerId}-${isoDate}`;
}

function dbToPlayer(db: DbPlayer): Player {
  return {
    id:               db.id,
    name:             db.name,
    phone:            db.phone,
    branchId:         db.branch_id,
    subscriptionMode: db.subscription_mode,
    sessions:         db.sessions,
    startDate:        db.start_date,
    endDate:          db.end_date,
    isPaused:         db.is_paused ?? false,
  };
}

function dbToBranch(db: DbBranch): BranchLite {
  return { id: db.id, name: db.name, days: db.days };
}

// ── Period map builder ────────────────────────────────────────────────────────

function buildPeriodsMap(
  rawPeriods:  PaymentPeriod[],
  players:     Player[],
  branchMap:   Map<string, BranchLite>,
): Map<string, SubscriptionPeriod[]> {
  const playerMap = new Map(players.map((p) => [p.id, p]));

  const byPlayer = new Map<string, PaymentPeriod[]>();
  for (const row of rawPeriods) {
    if (!byPlayer.has(row.player_id)) byPlayer.set(row.player_id, []);
    byPlayer.get(row.player_id)!.push(row);
  }

  const result = new Map<string, SubscriptionPeriod[]>();

  for (const [playerId, rows] of byPlayer) {
    const player = playerMap.get(playerId);
    const branch = player?.branchId ? branchMap.get(player.branchId) : undefined;

    const periods: SubscriptionPeriod[] = rows.map((row, idx) => {
      const isLast = idx === rows.length - 1;

      // For the last period: always use player.endDate (reflects extensions beyond payment.subscription_end)
      if (isLast && player?.endDate) {
        return { start: row.start, end: player.endDate };
      }

      if (row.end !== null) return { start: row.start, end: row.end };

      if (player) {
        if (player.subscriptionMode === "شهري") {
          return { start: row.start, end: computeMonthlyEndISO(row.start) };
        }
        if (player.subscriptionMode === "حصص" && branch?.days?.length && player.sessions > 0) {
          const end = computeSessionsEndISO(row.start, branch.days, player.sessions);
          return { start: row.start, end };
        }
      }

      return { start: row.start, end: null };
    });

    result.set(playerId, periods);
  }

  return result;
}

// ── Arabic month display ──────────────────────────────────────────────────────

const ARABIC_MONTHS = [
  "يناير", "فبراير", "مارس",   "أبريل", "مايو",   "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر","نوفمبر", "ديسمبر",
];

function formatMonthArabic(yyyyMM: string): string {
  const [yyyy, mm] = yyyyMM.split("-").map(Number);
  return `${ARABIC_MONTHS[mm - 1]} ${yyyy}`;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AttendancePage() {
  const [selectedMonth,    setSelectedMonth]    = useState<string>(currentMonthKey);
  const [selectedBranchId, setSelectedBranchId] = useState<string>("all");

  const [players,               setPlayers]               = useState<Player[]>([]);
  const [branches,              setBranches]              = useState<BranchLite[]>([]);
  const [paymentRaws,           setPaymentRaws]           = useState<PaymentPeriod[]>([]);
  const [attendanceMap,         setAttendanceMap]         = useState<AttendanceMap>(new Map());
  // Extra training dates from calendar events: branchId → Set of ISO dates in selected month
  const [calendarTrainingSets,  setCalendarTrainingSets]  = useState<Map<string, Set<string>>>(new Map());
  const [academyName,   setAcademyName]   = useState<string>("");
  const [printMode,        setPrintMode]        = useState<"monthly" | "weekly" | "custom">("monthly");
  const [printWeekIdx,     setPrintWeekIdx]     = useState<number>(0);
  const [printCustomStart, setPrintCustomStart] = useState<string>("");
  const [printCustomEnd,   setPrintCustomEnd]   = useState<string>("");

  const [loading,   setLoading]   = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── Performance: track whether static data (players/branches/periods) has
  //    been loaded so we skip refetching it when only the month changes.
  const staticLoadedRef = useRef(false);

  // ── Load ────────────────────────────────────────────────────────────────────

  const loadAll = useCallback(async (month: string) => {
    setLoading(true);
    setPageError(null);
    try {
      if (!staticLoadedRef.current) {
        // First load: fetch everything in parallel
        const [dbPlayers, dbBranches, dbAttendance, periods, calEvents] = await Promise.all([
          listPlayers(),
          listBranches(),
          listAttendanceByMonth(month),
          listPaymentPeriods(),
          listCalendarEvents(firstDayOfMonth(month), lastDayOfMonth(month)),
        ]);

        setPlayers(dbPlayers.map(dbToPlayer));
        setBranches(dbBranches.map(dbToBranch));
        setPaymentRaws(periods);
        staticLoadedRef.current = true;

        const map: AttendanceMap = new Map();
        for (const rec of dbAttendance) {
          map.set(attKey(rec.player_id, rec.date), rec.present);
        }
        setAttendanceMap(map);

        // Build map of extra training dates from calendar events
        const trainingSets = new Map<string, Set<string>>();
        for (const ev of calEvents) {
          if (ev.event_type !== "training" || !ev.branch_id) continue;
          if (!trainingSets.has(ev.branch_id)) trainingSets.set(ev.branch_id, new Set());
          trainingSets.get(ev.branch_id)!.add(ev.date);
        }
        setCalendarTrainingSets(trainingSets);

        // Fetch academy name sequentially (after parallel loads) so we don't
        // add a competing getSession() call that races on iOS Safari navigator.locks.
        try {
          const supabase = createClient();
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            const { data: profile } = await supabase
              .from("profiles")
              .select("academy_id")
              .eq("user_id", session.user.id)
              .maybeSingle();
            if (profile?.academy_id) {
              const { data: academy } = await supabase
                .from("academies")
                .select("name")
                .eq("id", profile.academy_id)
                .single();
              if (academy?.name) setAcademyName(academy.name);
            }
          }
        } catch { /* non-critical: print header falls back to "الأكاديمية" */ }
      } else {
        // Month change: re-fetch attendance records + calendar training events for new month
        const [dbAttendance, calEvents] = await Promise.all([
          listAttendanceByMonth(month),
          listCalendarEvents(firstDayOfMonth(month), lastDayOfMonth(month)),
        ]);
        const map: AttendanceMap = new Map();
        for (const rec of dbAttendance) {
          map.set(attKey(rec.player_id, rec.date), rec.present);
        }
        setAttendanceMap(map);

        // Rebuild calendar training map for the new month
        const trainingSets = new Map<string, Set<string>>();
        for (const ev of calEvents) {
          if (ev.event_type !== "training" || !ev.branch_id) continue;
          if (!trainingSets.has(ev.branch_id)) trainingSets.set(ev.branch_id, new Set());
          trainingSets.get(ev.branch_id)!.add(ev.date);
        }
        setCalendarTrainingSets(trainingSets);
      }
    } catch (e) {
      console.error("[attendance] load error:", e);
      setPageError(formatError(e));
    } finally {
      setLoading(false);
    }
  }, []); // stable — uses ref, not state

  useEffect(() => {
    loadAll(selectedMonth);
  }, [selectedMonth, loadAll]);

  // ── Derived ─────────────────────────────────────────────────────────────────

  const branchMap = useMemo(() => {
    const m = new Map<string, BranchLite>();
    branches.forEach((b) => m.set(b.id, b));
    return m;
  }, [branches]);

  const [year, month] = useMemo(
    () => selectedMonth.split("-").map(Number) as [number, number],
    [selectedMonth]
  );

  const periodsMap = useMemo(
    () => buildPeriodsMap(paymentRaws, players, branchMap),
    [paymentRaws, players, branchMap]
  );

  const activePlayers = useMemo(
    () => players.filter((p) => isActiveInMonth(periodsMap.get(p.id) ?? [], selectedMonth)),
    [players, periodsMap, selectedMonth]
  );

  const filteredPlayers = useMemo(() => {
    if (selectedBranchId === "all") return activePlayers;
    return activePlayers.filter((p) => p.branchId === selectedBranchId);
  }, [activePlayers, selectedBranchId]);

  // ── Print data ──────────────────────────────────────────────────────────────

  const printSessionDates = useMemo(() => {
    const dates = new Set<string>();
    for (const player of filteredPlayers) {
      const branch = player.branchId ? branchMap.get(player.branchId) : null;
      if (!branch) continue;
      for (const d of getSessionDates(year, month, branch.days)) {
        dates.add(toISODate(d));
      }
    }
    return Array.from(dates).sort();
  }, [filteredPlayers, branchMap, year, month]);

  const weeksInMonth = useMemo(() => {
    const chunks: [number, number][] = [[1, 7], [8, 14], [15, 21], [22, 28], [29, 31]];
    const lastDay = new Date(year, month, 0).getDate();
    const groups: { label: string; dates: string[] }[] = [];
    for (const [start, end] of chunks) {
      const dates = printSessionDates.filter((iso) => {
        const day = Number(iso.slice(8, 10));
        return day >= start && day <= end;
      });
      if (dates.length > 0) {
        groups.push({ label: `${start}–${Math.min(end, lastDay)}`, dates });
      }
    }
    return groups;
  }, [printSessionDates, year, month]);

  const printSessionDatesFinal = useMemo(() => {
    if (printMode === "monthly") return printSessionDates;
    if (printMode === "weekly")  return weeksInMonth[printWeekIdx]?.dates ?? printSessionDates;
    if (!printCustomStart || !printCustomEnd) return printSessionDates;
    return printSessionDates.filter(
      (iso) => iso >= printCustomStart && iso <= printCustomEnd
    );
  }, [printMode, printSessionDates, weeksInMonth, printWeekIdx, printCustomStart, printCustomEnd]);

  const printData = useMemo(() => {
    return filteredPlayers
      .map((player) => {
        const periods = periodsMap.get(player.id) ?? [];
        const symbols = printSessionDatesFinal.map((iso) => {
          const state = getDateState(iso, periods);
          if (state === "not_subscribed") return "";
          if (state === "expired") return "○";
          return (attendanceMap.get(attKey(player.id, iso)) ?? false) ? "✓" : "✕";
        });
        const branch = player.branchId ? (branchMap.get(player.branchId)?.name ?? "—") : "—";
        return { player, branch, symbols };
      })
      .filter(({ symbols }) => {
        if (printMode === "monthly") return true;
        return symbols.some((s) => s === "✓" || s === "✕");
      });
  }, [filteredPlayers, periodsMap, printSessionDatesFinal, attendanceMap, branchMap, printMode]);

  // ── Toggle attendance ───────────────────────────────────────────────────────

  const toggleAttendance = useCallback(
    async (player: Player, isoDate: string) => {
      const key     = attKey(player.id, isoDate);
      const current = attendanceMap.get(key) ?? false;
      const next    = !current;

      setAttendanceMap((prev) => new Map(prev).set(key, next));
      setSavingKey(key);
      setSaveError(null);

      try {
        await upsertAttendance(player.id, player.branchId, isoDate, next);
      } catch (e) {
        setAttendanceMap((prev) => new Map(prev).set(key, current));
        setSaveError(formatError(e));
      } finally {
        setSavingKey(null);
      }
    },
    [attendanceMap]
  );

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <main className="flex-1 p-4 md:p-6" dir="rtl">

      {/* Page header */}
      <div className="flex flex-col gap-2 mb-5">
        <h1 className="text-2xl font-semibold">سجل الحضور</h1>
        <p className="text-sm text-white/60">
          سجّل حضور اللاعبين لكل جلسة تدريبية في الشهر.
        </p>
      </div>

      {/* Error banners */}
      {pageError && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {pageError}
          <button
            type="button"
            onClick={() => loadAll(selectedMonth)}
            className="mr-3 underline hover:text-red-200"
          >
            إعادة المحاولة
          </button>
        </div>
      )}
      {saveError && (
        <div className="mb-4 rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-3 text-sm text-orange-300">
          خطأ في الحفظ: {saveError}
        </div>
      )}

      {/* Controls bar */}
      <div className="mb-4 flex flex-col gap-3">
        {/* Month selector row */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-white/60 shrink-0">الشهر:</span>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => { if (e.target.value) setSelectedMonth(e.target.value); }}
            className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-emerald-400/60 [color-scheme:dark]"
          />
          <span className="text-sm font-medium text-emerald-300">
            {formatMonthArabic(selectedMonth)}
          </span>
        </div>

        {/* Print controls row */}
        {!loading && filteredPlayers.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            {!loading && (
              <span className="text-xs text-white/40 shrink-0">
                {filteredPlayers.length} لاعب نشط هذا الشهر
              </span>
            )}
            {/* Mode toggle */}
            <div className="flex rounded-lg overflow-hidden border border-white/10 text-xs">
              {(["monthly", "weekly", "custom"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setPrintMode(m);
                    setPrintWeekIdx(0);
                    if (m === "custom") {
                      const [y, mo] = selectedMonth.split("-").map(Number);
                      const lastDay = new Date(y, mo, 0).getDate();
                      if (!printCustomStart) setPrintCustomStart(`${selectedMonth}-01`);
                      if (!printCustomEnd)   setPrintCustomEnd(`${selectedMonth}-${String(lastDay).padStart(2, "0")}`);
                    }
                  }}
                  className={`px-3 py-1.5 transition ${printMode === m ? "bg-white/15 text-white" : "bg-white/5 text-white/50 hover:bg-white/10 hover:text-white"}`}
                >
                  {m === "monthly" ? "شهري" : m === "weekly" ? "أسبوعي" : "مخصص"}
                </button>
              ))}
            </div>
            {/* Custom date pickers */}
            {printMode === "custom" && (
              <div className="flex items-center gap-1.5 text-xs">
                <input
                  type="date"
                  value={printCustomStart}
                  onChange={(e) => setPrintCustomStart(e.target.value)}
                  className="h-7 rounded-lg border border-white/10 bg-white/5 px-2 text-xs text-white outline-none focus:border-emerald-400/60 [color-scheme:dark]"
                />
                <span className="text-white/40">—</span>
                <input
                  type="date"
                  value={printCustomEnd}
                  onChange={(e) => setPrintCustomEnd(e.target.value)}
                  className="h-7 rounded-lg border border-white/10 bg-white/5 px-2 text-xs text-white outline-none focus:border-emerald-400/60 [color-scheme:dark]"
                />
              </div>
            )}
            {/* Week chips */}
            {printMode === "weekly" && weeksInMonth.map((w, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setPrintWeekIdx(i)}
                className={`px-2.5 py-1 rounded-full text-xs transition border ${printWeekIdx === i ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-300" : "border-white/10 bg-white/5 text-white/50 hover:bg-white/10 hover:text-white"}`}
              >
                {w.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10 hover:text-white transition shrink-0"
            >
              🖨 طباعة الكشف
            </button>
          </div>
        )}
      </div>

      {/* Branch filter tabs */}
      {branches.length > 0 && (
        <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
          <BranchTab
            label="جميع الفروع"
            active={selectedBranchId === "all"}
            onClick={() => setSelectedBranchId("all")}
          />
          {branches.map((b) => (
            <BranchTab
              key={b.id}
              label={b.name}
              active={selectedBranchId === b.id}
              onClick={() => setSelectedBranchId(b.id)}
            />
          ))}
        </div>
      )}

      {/* Player cards */}
      {loading ? (
        <div className="flex justify-center py-16 text-white/40 text-sm">جاري التحميل…</div>
      ) : filteredPlayers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-white/40 text-sm gap-2">
          <span className="text-3xl">👥</span>
          <span>لا يوجد لاعبون نشطون في هذا الشهر.</span>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredPlayers.map((player) => {
            const branch       = player.branchId ? (branchMap.get(player.branchId) ?? null) : null;
            const sessionDates = branch ? getSessionDates(year, month, branch.days) : [];
            const periods      = periodsMap.get(player.id) ?? [];

            // Merge scheduled session dates with extra calendar training dates
            const sessionISOSet = new Set(sessionDates.map(toISODate));
            const extraTraining = player.branchId
              ? (calendarTrainingSets.get(player.branchId) ?? new Set<string>())
              : new Set<string>();
            for (const iso of extraTraining) {
              if (iso.startsWith(selectedMonth)) sessionISOSet.add(iso);
            }
            const allISOs = Array.from(sessionISOSet).sort();

            const dateEntries: DateEntry[] = allISOs.map((iso) => ({
              date: new Date(iso + "T00:00:00"),
              iso,
              state: getDateState(iso, periods),
            }));

            const presentCount = dateEntries.filter(
              ({ state, iso }) =>
                state === "active" && attendanceMap.get(attKey(player.id, iso)) === true
            ).length;

            const totalActive = dateEntries.filter(({ state }) => state === "active").length;
            const pct = totalActive > 0 ? Math.round((presentCount / totalActive) * 100) : 0;

            return (
              <PlayerCard
                key={player.id}
                player={player}
                branch={branch}
                dateEntries={dateEntries}
                attendanceMap={attendanceMap}
                savingKey={savingKey}
                presentCount={presentCount}
                totalActive={totalActive}
                pct={pct}
                onToggle={toggleAttendance}
              />
            );
          })}
        </div>
      )}

      {/* ── Printable attendance sheet ──────────────────────────────────────── */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media screen {
          #attendance-print-sheet { display: none; }
        }
        @media print {
          @page { size: A4 landscape; margin: 1.5cm; }
          body * { visibility: hidden; }
          #attendance-print-sheet,
          #attendance-print-sheet * { visibility: visible; }
          #attendance-print-sheet {
            position: absolute;
            top: 0; left: 0;
            width: 100%;
            direction: rtl;
            font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
            background: white !important;
            color: black !important;
            padding: 0; margin: 0; overflow: visible;
          }
          table { width: 100%; border-collapse: collapse; }
          thead { display: table-header-group; }
          tr { page-break-inside: avoid; page-break-after: auto; }
          td, th {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      ` }} />
      <div id="attendance-print-sheet">
        <div style={{ marginBottom: "16px", borderBottom: "2px solid #333", paddingBottom: "10px" }}>
          <div style={{ fontSize: "20px", fontWeight: "800", color: "#111" }}>
            {academyName || "الأكاديمية"} &mdash; كشف الحضور
          </div>
          <div style={{ display: "flex", gap: "16px", marginTop: "5px", fontSize: "13px", color: "#444" }}>
            <span>
              <strong>{ARABIC_MONTHS[Number(selectedMonth.slice(5, 7)) - 1]}</strong>
              {" "}{selectedMonth.slice(0, 4)}
              {printMode === "weekly" && weeksInMonth[printWeekIdx] && (
                <span style={{ marginRight: "6px", color: "#666" }}>
                  (الأيام {weeksInMonth[printWeekIdx].label})
                </span>
              )}
              {printMode === "custom" && printCustomStart && (
                <span style={{ marginRight: "6px", color: "#666" }}>
                  ({printCustomStart} — {printCustomEnd})
                </span>
              )}
            </span>
            {selectedBranchId !== "all" && (
              <span>الفرع: <strong>{branches.find((b) => b.id === selectedBranchId)?.name ?? ""}</strong></span>
            )}
            <span>عدد اللاعبين: <strong>{printData.length}</strong></span>
          </div>
        </div>

        {printSessionDatesFinal.length > 0 && printData.length > 0 ? (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
            <thead>
              <tr style={{ background: "#f3f4f6" }}>
                <th style={{ border: "1px solid #ccc", padding: "5px 8px", textAlign: "right", minWidth: "120px" }}>
                  اللاعب
                </th>
                <th style={{ border: "1px solid #ccc", padding: "5px 8px", textAlign: "center", minWidth: "70px" }}>
                  الفرع
                </th>
                {printSessionDatesFinal.map((iso) => {
                  const day = Number(iso.slice(8, 10));
                  const [dy, dm] = iso.split("-").map(Number);
                  const jsDay = new Date(dy, dm - 1, day).getDay();
                  const dayNames = ["أح","اث","ثل","أر","خم","جم","سب"];
                  return (
                    <th
                      key={iso}
                      style={{ border: "1px solid #ccc", padding: "4px 3px", textAlign: "center", minWidth: "32px" }}
                    >
                      <div>{day}</div>
                      <div style={{ fontSize: "9px", color: "#666" }}>{dayNames[jsDay]}</div>
                    </th>
                  );
                })}
                <th style={{ border: "1px solid #ccc", padding: "5px 8px", textAlign: "center", minWidth: "55px" }}>
                  الحضور
                </th>
              </tr>
            </thead>
            <tbody>
              {printData.map(({ player, branch, symbols }) => {
                const presentCount = symbols.filter((s) => s === "✓").length;
                const activeCount  = symbols.filter((s) => s === "✓" || s === "✕").length;
                return (
                  <tr key={player.id}>
                    <td style={{ border: "1px solid #ccc", padding: "4px 8px" }}>{player.name}</td>
                    <td style={{ border: "1px solid #ccc", padding: "4px 6px", textAlign: "center", color: "#555" }}>{branch}</td>
                    {symbols.map((sym, i) => (
                      <td
                        key={i}
                        style={{
                          border: "1px solid #ccc",
                          padding: "4px 2px",
                          textAlign: "center",
                          color: sym === "✓" ? "#16a34a" : sym === "✕" ? "#dc2626" : sym === "○" ? "#9ca3af" : "#ccc",
                          fontWeight: sym === "✓" || sym === "✕" ? "bold" : "normal",
                        }}
                      >
                        {sym || "—"}
                      </td>
                    ))}
                    <td style={{ border: "1px solid #ccc", padding: "4px 6px", textAlign: "center", fontWeight: "600" }}>
                      {activeCount > 0 ? `${presentCount}/${activeCount}` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p style={{ color: "#888" }}>لا توجد بيانات للطباعة.</p>
        )}

        <div style={{ marginTop: "10px", fontSize: "10px", color: "#aaa" }}>
          ✓ حاضر · ✕ غائب · ○ منتهي الاشتراك · — غير مشترك
        </div>
      </div>
    </main>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function BranchTab({ label, active, onClick }: {
  label: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "shrink-0 rounded-full px-4 py-1.5 text-sm transition whitespace-nowrap",
        active
          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
          : "bg-white/5 text-white/60 border border-white/10 hover:bg-white/10 hover:text-white",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

// ── Player card ───────────────────────────────────────────────────────────────

type PlayerCardProps = {
  player:        Player;
  branch:        BranchLite | null;
  dateEntries:   DateEntry[];
  attendanceMap: AttendanceMap;
  savingKey:     string | null;
  presentCount:  number;
  totalActive:   number;
  pct:           number;
  onToggle:      (player: Player, isoDate: string) => Promise<void>;
};

// Today's ISO date for Feature C paused chip logic
function getTodayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function PlayerCard({
  player, branch, dateEntries, attendanceMap, savingKey, presentCount, totalActive, pct, onToggle,
}: PlayerCardProps) {
  const todayISO = getTodayISO();

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-white/[0.03]">
        <div>
          <div className="flex items-center gap-2 font-semibold text-sm">
            {player.name}
            {player.isPaused && (
              <span className="rounded-full bg-blue-500/15 border border-blue-400/25 px-2 py-0.5 text-[10px] font-medium text-blue-400">
                تجميد
              </span>
            )}
          </div>
          <div className="text-xs text-white/50 mt-0.5">
            {branch ? branch.name : "بدون فرع"}
            {player.phone ? ` · ${player.phone}` : ""}
          </div>
        </div>
        <SubscriptionBadge endDate={player.isPaused ? null : player.endDate} isPaused={player.isPaused} />
      </div>

      {/* Date chips */}
      {dateEntries.length === 0 ? (
        <div className="px-4 py-4 text-xs text-white/30 text-center">
          {branch ? "لا توجد جلسات هذا الشهر لأيام هذا الفرع" : "لم يتم تعيين فرع"}
        </div>
      ) : (
        <div className="px-3 pt-3 pb-1 overflow-x-auto">
          <div className="flex gap-2 pb-2" style={{ minWidth: "max-content" }}>
            {dateEntries.map(({ date, iso, state }) => {
              const key      = attKey(player.id, iso);
              const present  = attendanceMap.get(key) ?? false;
              const isSaving = savingKey === key;
              const dayName  = JS_DAY_TO_ARABIC[date.getDay()];
              // Feature C: paused chip for today/future dates when player is paused
              const isPausedDate = player.isPaused && iso >= todayISO && state === "active";
              return (
                <DateChip
                  key={iso}
                  dayShort={DAY_SHORT[dayName] ?? dayName.slice(0, 3)}
                  dayNum={date.getDate()}
                  state={state}
                  present={present}
                  isSaving={isSaving}
                  isPausedDate={isPausedDate}
                  onToggle={() => !isPausedDate && state === "active" && onToggle(player, iso)}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Footer */}
      {totalActive > 0 && (
        <div className="px-4 py-2.5 border-t border-white/5 flex items-center justify-between">
          <span className="text-xs text-white/50">الحضور: {presentCount}/{totalActive}</span>
          <AttendanceBar pct={pct} />
        </div>
      )}
    </div>
  );
}

// ── Date chip — three states ───────────────────────────────────────────────────

type DateChipProps = {
  dayShort:     string;
  dayNum:       number;
  state:        DateState;
  present:      boolean;
  isSaving:     boolean;
  isPausedDate?: boolean;  // Feature C
  onToggle:     () => void;
};

function DateChip({ dayShort, dayNum, state, present, isSaving, isPausedDate, onToggle }: DateChipProps) {

  // Feature C: paused chip (blue, non-interactive)
  if (isPausedDate) {
    return (
      <div className="flex flex-col items-center gap-1 min-w-[52px] rounded-xl border border-blue-500/20 bg-blue-500/5 px-2 py-2 select-none">
        <span className="text-[10px] text-white/30 font-medium">{dayShort}</span>
        <span className="text-sm font-bold text-white/30">{dayNum}</span>
        <span className="text-[9px] text-blue-400/70 font-medium leading-tight text-center">
          تجميد
        </span>
      </div>
    );
  }

  if (state === "not_subscribed") {
    return (
      <div className="flex flex-col items-center gap-1 min-w-[52px] rounded-xl border border-white/5 bg-transparent px-2 py-2 opacity-30 select-none">
        <span className="text-[10px] text-white/50 font-medium">{dayShort}</span>
        <span className="text-sm font-bold text-white/40">{dayNum}</span>
        <span className="text-[9px] text-white/40 font-medium leading-tight text-center">
          غير<br />مشترك
        </span>
      </div>
    );
  }

  if (state === "expired") {
    return (
      <div className="flex flex-col items-center gap-1 min-w-[52px] rounded-xl border border-red-500/20 bg-red-500/5 px-2 py-2 select-none">
        <span className="text-[10px] text-white/30 font-medium">{dayShort}</span>
        <span className="text-sm font-bold text-white/30">{dayNum}</span>
        <span className="text-[9px] text-red-400/70 font-medium leading-tight text-center">
          منتهي<br />الاشتراك
        </span>
      </div>
    );
  }

  // "active" → interactive checkbox
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={isSaving}
      aria-label={`${dayShort} ${dayNum}: ${present ? "حاضر" : "غائب"}`}
      className={[
        "flex flex-col items-center gap-1 min-w-[52px] rounded-xl border px-2 py-2 transition",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400",
        isSaving
          ? "opacity-50 cursor-wait border-white/10 bg-white/5"
          : present
          ? "border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 active:scale-95"
          : "border-white/10 bg-white/5 hover:bg-white/10 active:scale-95",
      ].join(" ")}
    >
      <span className={["text-[10px] font-medium", present ? "text-emerald-300" : "text-white/40"].join(" ")}>
        {dayShort}
      </span>
      <span className={["text-sm font-bold", present ? "text-white" : "text-white/60"].join(" ")}>
        {dayNum}
      </span>
      <span
        className={[
          "w-4 h-4 rounded-full border flex items-center justify-center transition",
          isSaving ? "border-white/20"
            : present ? "border-emerald-400 bg-emerald-500"
            : "border-white/20 bg-transparent",
        ].join(" ")}
      >
        {present && (
          <svg viewBox="0 0 10 8" className="w-2.5 h-2 fill-current text-white">
            <path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.5" fill="none"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
    </button>
  );
}

// ── Subscription status badge ─────────────────────────────────────────────────

function SubscriptionBadge({ endDate, isPaused }: { endDate: string | null; isPaused?: boolean }) {
  if (isPaused) {
    return <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-xs font-medium text-blue-400">تجميد</span>;
  }
  if (!endDate) {
    return <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-300">نشط</span>;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [yyyy, mm, dd] = endDate.split("-").map(Number);
  const end = new Date(yyyy, mm - 1, dd);
  const diffDays = Math.ceil((end.getTime() - today.getTime()) / 86400000);

  if (diffDays < 0)  return <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-300">منتهي</span>;
  if (diffDays <= 7) return <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-300">ينتهي قريباً</span>;
  return <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-300">نشط</span>;
}

// ── Attendance bar ────────────────────────────────────────────────────────────

function AttendanceBar({ pct }: { pct: number }) {
  const color = pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500";
  const text  = pct >= 80 ? "text-emerald-400" : pct >= 50 ? "text-amber-400" : "text-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-medium ${text}`}>{pct}%</span>
    </div>
  );
}
