"use client";

import { useEffect, useMemo, useState } from "react";
import { getUserRole, type UserRole } from "@/src/lib/supabase/roles";
import { resolveAcademyId } from "@/src/lib/supabase/academyId";
import { createClient } from "@/src/lib/supabase/browser";
import { listPlayers } from "@/src/lib/supabase/players";
import { listPayments } from "@/src/lib/supabase/payments";
import { listBranches } from "@/src/lib/supabase/branches";
import { listFinanceTx } from "@/src/lib/supabase/finance";
import { listAttendanceByMonth, type DbAttendance } from "@/src/lib/supabase/attendance";
import { computeInsights } from "@/src/lib/insights";

import {
  type Player,
  type Branch,
  type FinanceTx,
  type Payment,
  type ChartRange,
  type ChartPoint,
  type MonthSummary,
  dbToPlayer,
  dbToBranch,
  dbToPayment,
  dbToTx,
  endOfMonthFromYM,
  ddmmyyyyToDate,
  todayISO,
  monthKey,
  prevMonthKey,
  monthsBetween,
  buildMonthSummary,
} from "./_utils";

export type BranchRow = {
  id: string;
  name: string;
  revenue: number;
  expenses: number;
  profit: number;
};

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useDashboardData() {
  const supabase = createClient();

  const [academyName, setAcademyName]   = useState<string>("");
  const [players, setPlayers]           = useState<Player[]>([]);
  const [payments, setPayments]         = useState<Payment[]>([]);
  const [branches, setBranches]         = useState<Branch[]>([]);
  const [tx, setTx]                     = useState<FinanceTx[]>([]);
  const [attendance, setAttendance]     = useState<DbAttendance[]>([]);
  const [loading, setLoading]           = useState(true);
  const [pageError, setPageError]       = useState<string | null>(null);
  const [userRole, setUserRole]         = useState<UserRole>("admin_staff");

  // Month selector — user-controlled, defaults to current month
  const defaultMonth = useMemo(() => monthKey(todayISO()), []);
  const [selectedMonth, setSelectedMonth] = useState<string>(() => monthKey(todayISO()));

  // Branch filter
  const [selectedBranchId, setSelectedBranchId] = useState<string>("all");

  // Chart time range
  const [chartRange, setChartRange]   = useState<ChartRange>(3);
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd]     = useState<string>("");

  // ── Load all data ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const loadAll = async () => {
      setLoading(true);
      setPageError(null);

      try {
        const [
          { data: { user } },
          role,
        ] = await Promise.all([
          supabase.auth.getUser(),
          getUserRole(),
        ]);
        if (!user) {
          if (!cancelled) setPageError("يرجى تسجيل الدخول أولاً.");
          return;
        }
        if (!cancelled) setUserRole(role);

        const academyId = await resolveAcademyId();

        // Build last-24-months filter: covers any chart range (max 12) plus up to
        // 12 months of backward navigation in the month picker.
        const last24: string[] = [];
        {
          let cur = monthKey(todayISO());
          for (let i = 0; i < 24; i++) {
            last24.push(cur);
            cur = prevMonthKey(cur);
          }
        }

        const currentMonth = monthKey(todayISO());
        const [academyRes, dbPlayers, dbPayments, dbBranches, dbTx, dbAttendance] = await Promise.all([
          supabase.from("academies").select("name").eq("id", academyId).single(),
          listPlayers(),
          listPayments(),
          listBranches(),
          listFinanceTx(last24),
          listAttendanceByMonth(currentMonth),
        ]);

        if (cancelled) return;

        setAcademyName(academyRes.data?.name ?? "");
        setPlayers(dbPlayers.map(dbToPlayer));
        setPayments(dbPayments.map(dbToPayment));
        setBranches(dbBranches.map(dbToBranch));
        setTx(dbTx.filter((t) => t.source !== "suppressed").map(dbToTx));
        setAttendance(dbAttendance);
      } catch (e) {
        console.error("[dashboard] load error:", e);
        if (!cancelled) {
          setPageError(e instanceof Error ? e.message : "خطأ في تحميل البيانات.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadAll();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Branch-filtered views ──────────────────────────────────────────────────
  const filteredPlayers = useMemo(
    () => selectedBranchId === "all" ? players : players.filter((p) => p.branchId === selectedBranchId),
    [players, selectedBranchId]
  );

  const filteredPayments = useMemo(
    () => selectedBranchId === "all" ? payments : payments.filter((p) => p.branchId === selectedBranchId),
    [payments, selectedBranchId]
  );

  const filteredTx = useMemo(
    () => selectedBranchId === "all" ? tx : tx.filter((t) => t.branchId === selectedBranchId),
    [tx, selectedBranchId]
  );

  // ── Derived data ───────────────────────────────────────────────────────────
  const previousMonth = useMemo(() => prevMonthKey(selectedMonth), [selectedMonth]);

  const branchNameById = useMemo(() => {
    const m = new Map<string, string>();
    branches.forEach((b) => m.set(b.id, b.name));
    return m;
  }, [branches]);

  // Last calendar day of the selected month at midnight (00:00:00).
  const monthEnd   = useMemo(() => endOfMonthFromYM(selectedMonth), [selectedMonth]);
  // First calendar day of the selected month at midnight (00:00:00).
  const monthStart = useMemo(() => {
    const [y, m] = selectedMonth.split("-").map(Number);
    return new Date(y, m - 1, 1);
  }, [selectedMonth]);

  const activePlayers = useMemo(() => {
    return filteredPlayers.filter((p) => {
      // Paused players are not considered active
      if (p.isPaused) return false;
      const start = ddmmyyyyToDate(p.start);
      const end   = ddmmyyyyToDate(p.end);
      if (!start) return false;
      // Player started after the end of this month → not active this month
      if (start > monthEnd) return false;
      // No end date → unlimited subscription, always active
      if (!end) return true;
      // Active if the subscription overlaps with the selected month:
      // end must be on or after the first day of the month.
      // (Previously used end >= monthEnd which excluded players expiring mid-month.)
      return end >= monthStart;
    });
  }, [filteredPlayers, monthStart, monthEnd]);

  const expiring7 = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const in7 = new Date(now);
    in7.setDate(in7.getDate() + 7);

    return filteredPlayers.filter((p) => {
      if (p.isPaused) return false;
      const end = ddmmyyyyToDate(p.end);
      if (!end) return false;
      end.setHours(0, 0, 0, 0);
      return end >= now && end <= in7;
    });
  }, [filteredPlayers]);

  const cur  = useMemo<MonthSummary>(
    () => buildMonthSummary(filteredTx, selectedMonth),
    [filteredTx, selectedMonth]
  );
  const prev = useMemo<MonthSummary>(
    () => buildMonthSummary(filteredTx, previousMonth),
    [filteredTx, previousMonth]
  );

  const profitChangePct = useMemo(() => {
    const base = Math.abs(prev.profit);
    if (base < 1) return 0;
    return Math.round(((cur.profit - prev.profit) / base) * 100);
  }, [cur.profit, prev.profit]);

  const profitBadge = useMemo(() => {
    const sign = profitChangePct > 0 ? "↑" : profitChangePct < 0 ? "↓" : "•";
    return `${sign} ${Math.abs(profitChangePct)}%`;
  }, [profitChangePct]);

  const revenueChangePct = useMemo(() => {
    if (prev.revenue < 1) return 0;
    return Math.round(((cur.revenue - prev.revenue) / prev.revenue) * 100);
  }, [cur.revenue, prev.revenue]);

  const monthPayments = useMemo(
    () => filteredPayments.filter((p) => p.dateISO.slice(0, 7) === selectedMonth),
    [filteredPayments, selectedMonth]
  );

  const firstPaymentMonthByPlayer = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of filteredPayments) {
      const existing = m.get(p.playerId);
      if (!existing || p.dateISO < existing) m.set(p.playerId, p.dateISO.slice(0, 7));
    }
    return m;
  }, [filteredPayments]);

  const renewalStats = useMemo(() => {
    const thisMonthPlayerIds = new Set(
      monthPayments.filter((p) => p.kind !== "legacy").map((p) => p.playerId).filter(Boolean)
    );

    let newCount = 0;
    let renewCount = 0;

    for (const pid of thisMonthPlayerIds) {
      if (firstPaymentMonthByPlayer.get(pid) === selectedMonth) {
        newCount++;
      } else {
        renewCount++;
      }
    }

    return { newCount, renewCount };
  }, [monthPayments, selectedMonth, firstPaymentMonthByPlayer]);

  const { newCount, renewCount } = renewalStats;

  const renewalRate = useMemo(() => {
    const total = newCount + renewCount;
    if (total === 0) return 0;
    return Math.round((renewCount / total) * 100);
  }, [newCount, renewCount]);

  const branchRows = useMemo<BranchRow[]>(() => {
    const map = new Map<string, { revenue: number; expenses: number; profit: number }>();
    branches.forEach((b) => map.set(b.id, { revenue: 0, expenses: 0, profit: 0 }));

    // Always use the full (unfiltered) tx so every branch shows its real value
    // regardless of which branch is selected in the dashboard filter.
    const list = tx.filter((t) => t.month === selectedMonth);
    for (const t of list) {
      if (t.branchId === "all") continue;
      if (!map.has(t.branchId)) map.set(t.branchId, { revenue: 0, expenses: 0, profit: 0 });
      const row = map.get(t.branchId)!;
      if (t.type === "إيراد") row.revenue += t.amount || 0;
      else row.expenses += t.amount || 0;
      row.profit = row.revenue - row.expenses;
    }

    const byIdName = new Map(branches.map((b) => [b.id, b.name]));
    return Array.from(map.entries())
      .map(([id, v]) => ({ id, name: byIdName.get(id) ?? id, ...v }))
      .sort((a, b) => b.profit - a.profit);
  }, [tx, branches, selectedMonth]);

  // Chart data — range-aware, no net line
  const chartData = useMemo<ChartPoint[]>(() => {
    let months: string[];

    if (chartRange === "custom" && customStart && customEnd && customStart <= customEnd) {
      months = monthsBetween(customStart, customEnd);
    } else {
      const range = chartRange === "custom" ? 3 : chartRange;
      months = [];
      let curKey = selectedMonth;
      for (let i = 0; i < range; i++) {
        months.push(curKey);
        curKey = prevMonthKey(curKey);
      }
      months.reverse();
    }

    return months.map((ym) => {
      const s = buildMonthSummary(filteredTx, ym);
      return { month: ym, revenue: s.revenue, expenses: s.expenses };
    });
  }, [selectedMonth, filteredTx, chartRange, customStart, customEnd]);

  // Sparkline — fixed 6-month window for the hero card
  const sparklineData = useMemo(() => {
    const months: string[] = [];
    let curKey = selectedMonth;
    for (let i = 0; i < 6; i++) {
      months.push(curKey);
      curKey = prevMonthKey(curKey);
    }
    months.reverse();
    return months.map((ym) => buildMonthSummary(filteredTx, ym).revenue);
  }, [selectedMonth, filteredTx]);

  // Birth year distribution pie chart — one segment per exact birth year
  const ageDistribution = useMemo(() => {
    const yearCount = new Map<string, number>();

    for (const p of filteredPlayers) {
      if (!p.birth) continue;
      const year = p.birth.slice(0, 4);
      if (!year || isNaN(parseInt(year, 10))) continue;
      yearCount.set(year, (yearCount.get(year) ?? 0) + 1);
    }

    return Array.from(yearCount.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, value]) => ({ name, value }));
  }, [filteredPlayers]);

  // Top insights
  const topInsights = useMemo(() => {
    return computeInsights({
      players: filteredPlayers.map((p) => ({
        id:       p.id,
        name:     p.name,
        branchId: p.branchId,
        end:      p.end
          ? (() => {
              const parts = (p.end || "").split("/");
              if (parts.length !== 3) return null;
              const [dd, mm, yyyy] = parts;
              return `${yyyy}-${mm}-${dd}`;
            })()
          : null,
      })),
      payments: filteredPayments.map((p) => ({ playerId: p.playerId, dateISO: p.dateISO, kind: p.kind })),
      attendance: attendance.map((a) => ({
        player_id:    a.player_id,
        session_date: a.date,
        attended:     a.present,
      })),
      branches:   branches.map((b) => ({ id: b.id, name: b.name })),
      finance:    filteredTx.map((t) => ({
        month:  t.month,
        type:   t.type as "مصروف" | "إيراد",
        amount: t.amount,
        source: t.source,
      })),
      selectedMonth,
      today: todayISO(),
    }).slice(0, 3);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredPlayers, filteredPayments, branches, filteredTx, selectedMonth, attendance]);

  return {
    // Loading state
    loading,
    pageError,

    // Raw data needed by sections
    branches,

    // Filters
    defaultMonth,
    selectedMonth,
    setSelectedMonth,
    selectedBranchId,
    setSelectedBranchId,

    // Chart range controls
    chartRange,
    setChartRange,
    customStart,
    setCustomStart,
    customEnd,
    setCustomEnd,

    // Display strings
    academyName,
    userRole,

    // Derived values
    branchNameById,
    activePlayers,
    expiring7,
    cur,
    prev,
    profitChangePct,
    profitBadge,
    revenueChangePct,
    newCount,
    renewCount,
    renewalRate,
    branchRows,
    chartData,
    sparklineData,
    ageDistribution,
    topInsights,
  };
}
