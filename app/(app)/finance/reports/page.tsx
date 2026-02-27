"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  type DbFinanceTx,
  listFinanceTx,
} from "@/src/lib/supabase/finance";
import {
  type DbBranch,
  listBranches,
} from "@/src/lib/supabase/branches";
import {
  type DbPayment,
  listPayments,
} from "@/src/lib/supabase/payments";

type TxType = "مصروف" | "إيراد";
type SourceType = "auto" | "manual";
type Category =
  | "حجز ملعب"
  | "رواتب"
  | "اشتراكات"
  | "أدوات"
  | "تسويق"
  | "صيانة"
  | "مواصلات"
  | "أخرى";

type FinanceTx = {
  id: string;
  month: string; // YYYY-MM
  dateISO: string; // YYYY-MM-DD
  type: TxType;
  branchId: string | "all";
  category: Category;
  amount: number;
  note?: string;

  source: SourceType;
  autoKey?: string;
  overriddenAutoKey?: string;
  createdAtISO: string;
  updatedAtISO?: string;
};

type Payment = {
  id: string;
  dateISO: string; // YYYY-MM-DD
  branchId: string;
  playerId: string;
  amount: number;
  kind: "new" | "renew" | "legacy";
  note?: string;
};

// ── DB → local mappers ────────────────────────────────────────────────────────
function dbToTx(db: DbFinanceTx): FinanceTx {
  return {
    id: db.id,
    month: db.month,
    dateISO: db.date,
    type: db.type as TxType,
    branchId: db.branch_id,
    category: db.category as Category,
    amount: Number(db.amount),
    note: db.note ?? undefined,
    source: db.source as SourceType,
    autoKey: db.auto_key ?? undefined,
    overriddenAutoKey: db.overridden_auto_key ?? undefined,
    createdAtISO: db.created_at,
    updatedAtISO: db.updated_at ?? undefined,
  };
}
function dbToPayment(db: DbPayment): Payment {
  return {
    id: db.id,
    dateISO: db.date,
    branchId: db.branch_id ?? "all",
    playerId: db.player_id,
    amount: Number(db.amount),
    kind: db.kind,
  };
}

type PeriodMode = "month" | "quarter" | "half" | "year" | "custom";
type TabKey = "overview" | "revenue" | "expenses" | "branches" | "compare";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function monthKey(iso: string) {
  return iso.slice(0, 7);
}

function money(n: number) {
  const v = Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
  return `${v} د.ك`;
}

function pct(n: number) {
  if (!Number.isFinite(n)) return "0%";
  return `${Math.round(n * 10) / 10}%`;
}

function isoToTime(iso: string) {
  // iso YYYY-MM-DD
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

function clampISO(iso: string) {
  // safety
  return (iso || "").slice(0, 10);
}

function inRangeISO(iso: string, startISO: string, endISO: string) {
  const t = isoToTime(iso);
  return t >= isoToTime(startISO) && t <= isoToTime(endISO);
}

function addDaysISO(iso: string, days: number) {
  const t = isoToTime(iso);
  const d = new Date(t);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function startOfMonth(yyyyMM: string) {
  return `${yyyyMM}-01`;
}

function endOfMonth(yyyyMM: string) {
  const [y, m] = yyyyMM.split("-").map(Number);
  // last day of month: day 0 of next month
  const d = new Date(y, m, 0);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function quarterRange(year: number, q: 1 | 2 | 3 | 4) {
  const startMonth = (q - 1) * 3 + 1; // 1,4,7,10
  const start = `${year}-${String(startMonth).padStart(2, "0")}-01`;
  const endMonth = startMonth + 2;
  const end = endOfMonth(`${year}-${String(endMonth).padStart(2, "0")}`);
  return { start, end };
}

function halfRange(year: number, h: 1 | 2) {
  const startMonth = h === 1 ? 1 : 7;
  const start = `${year}-${String(startMonth).padStart(2, "0")}-01`;
  const endMonth = h === 1 ? 6 : 12;
  const end = endOfMonth(`${year}-${String(endMonth).padStart(2, "0")}`);
  return { start, end };
}

function yearRange(year: number) {
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

function daysBetweenInclusive(startISO: string, endISO: string) {
  const a = isoToTime(startISO);
  const b = isoToTime(endISO);
  const diff = Math.round((b - a) / (1000 * 60 * 60 * 24));
  return diff + 1;
}

function prevPeriodSameLength(startISO: string, endISO: string) {
  const len = daysBetweenInclusive(startISO, endISO);
  const prevEnd = addDaysISO(startISO, -1);
  const prevStart = addDaysISO(prevEnd, -(len - 1));
  return { start: prevStart, end: prevEnd };
}

function groupSum<T>(items: T[], keyFn: (t: T) => string, valFn: (t: T) => number) {
  const m = new Map<string, number>();
  for (const it of items) {
    const k = keyFn(it);
    const v = Number(valFn(it) || 0);
    m.set(k, (m.get(k) || 0) + v);
  }
  return m;
}

export default function FinanceReportsPage() {
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [tx, setTx] = useState<FinanceTx[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);

  // UI state
  const [tab, setTab] = useState<TabKey>("overview");
  const [branchFilter, setBranchFilter] = useState<string | "all">("all");

  const [mode, setMode] = useState<PeriodMode>("month");

  // selectors
  const [monthSel, setMonthSel] = useState<string>(monthKey(todayISO())); // YYYY-MM
  const [yearSel, setYearSel] = useState<number>(new Date().getFullYear());
  const [quarterSel, setQuarterSel] = useState<1 | 2 | 3 | 4>(1);
  const [halfSel, setHalfSel] = useState<1 | 2>(1);

  const [customStart, setCustomStart] = useState<string>(todayISO());
  const [customEnd, setCustomEnd] = useState<string>(todayISO());

  // Compare custom A vs B
  const [aStart, setAStart] = useState<string>(todayISO());
  const [aEnd, setAEnd] = useState<string>(todayISO());
  const [bStart, setBStart] = useState<string>(addDaysISO(todayISO(), -7));
  const [bEnd, setBEnd] = useState<string>(todayISO());

  // load data
  useEffect(() => {
    const load = async () => {
      try {
        const [dbBranches, dbTx, dbPayments] = await Promise.all([
          listBranches(),
          listFinanceTx(),
          listPayments(),
        ]);
        setBranches(dbBranches.map((b: DbBranch) => ({ id: b.id, name: b.name })));
        setTx(dbTx.map(dbToTx));
        setPayments(dbPayments.map(dbToPayment));
      } catch (e) {
        console.error("[reports] load error:", e);
      }
    };
    load();
  }, []);

  const period = useMemo(() => {
    if (mode === "month") return { start: startOfMonth(monthSel), end: endOfMonth(monthSel) };
    if (mode === "quarter") return quarterRange(yearSel, quarterSel);
    if (mode === "half") return halfRange(yearSel, halfSel);
    if (mode === "year") return yearRange(yearSel);
    // custom
    const s = clampISO(customStart);
    const e = clampISO(customEnd);
    return { start: s <= e ? s : e, end: s <= e ? e : s };
  }, [mode, monthSel, yearSel, quarterSel, halfSel, customStart, customEnd]);

  const prevPeriod = useMemo(() => prevPeriodSameLength(period.start, period.end), [period.start, period.end]);

  // filters
  const txInPeriod = useMemo(() => {
    return tx
      .filter((t) => inRangeISO(t.dateISO, period.start, period.end))
      .filter((t) => {
        if (branchFilter === "all") return true;
        return t.branchId === branchFilter || t.branchId === "all";
      });
  }, [tx, period, branchFilter]);

  const paymentsInPeriod = useMemo(() => {
    return payments
      .filter((p) => inRangeISO(p.dateISO, period.start, period.end))
      .filter((p) => (branchFilter === "all" ? true : p.branchId === branchFilter));
  }, [payments, period, branchFilter]);

  const txPrev = useMemo(() => {
    return tx
      .filter((t) => inRangeISO(t.dateISO, prevPeriod.start, prevPeriod.end))
      .filter((t) => {
        if (branchFilter === "all") return true;
        return t.branchId === branchFilter || t.branchId === "all";
      });
  }, [tx, prevPeriod, branchFilter]);

  const paymentsPrev = useMemo(() => {
    return payments
      .filter((p) => inRangeISO(p.dateISO, prevPeriod.start, prevPeriod.end))
      .filter((p) => (branchFilter === "all" ? true : p.branchId === branchFilter));
  }, [payments, prevPeriod, branchFilter]);

  // core metrics (tx)
  const summary = useMemo(() => {
    const revenueTx = txInPeriod.filter((t) => t.type === "إيراد").reduce((s, t) => s + (t.amount || 0), 0);
    const expensesTx = txInPeriod.filter((t) => t.type === "مصروف").reduce((s, t) => s + (t.amount || 0), 0);
    const profit = revenueTx - expensesTx;
    const margin = revenueTx > 0 ? (profit / revenueTx) * 100 : 0;

    const salaries = txInPeriod
      .filter((t) => t.type === "مصروف" && t.category === "رواتب")
      .reduce((s, t) => s + (t.amount || 0), 0);

    const field = txInPeriod
      .filter((t) => t.type === "مصروف" && t.category === "حجز ملعب")
      .reduce((s, t) => s + (t.amount || 0), 0);

    return { revenueTx, expensesTx, profit, margin, salaries, field };
  }, [txInPeriod]);

  // subscription metrics (payments)
  const subs = useMemo(() => {
    const sum = paymentsInPeriod.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const count = paymentsInPeriod.length;
    const avg = count ? sum / count : 0;
    const newCount = paymentsInPeriod.filter((p) => p.kind === "new").length;
    const renewCount = paymentsInPeriod.filter((p) => p.kind === "renew").length;
    return { sum, count, avg, newCount, renewCount };
  }, [paymentsInPeriod]);

  // previous metrics for compare
  const prev = useMemo(() => {
    const revenueTx = txPrev.filter((t) => t.type === "إيراد").reduce((s, t) => s + (t.amount || 0), 0);
    const expensesTx = txPrev.filter((t) => t.type === "مصروف").reduce((s, t) => s + (t.amount || 0), 0);
    const profit = revenueTx - expensesTx;

    const subsSum = paymentsPrev.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const subsCount = paymentsPrev.length;

    return { revenueTx, expensesTx, profit, subsSum, subsCount };
  }, [txPrev, paymentsPrev]);

  const deltas = useMemo(() => {
    return {
      dRevenue: summary.revenueTx - prev.revenueTx,
      dExpenses: summary.expensesTx - prev.expensesTx,
      dProfit: summary.profit - prev.profit,
      dSubsSum: subs.sum - prev.subsSum,
      dSubsCount: subs.count - prev.subsCount,
    };
  }, [summary, prev, subs]);

  // trend by month (inside period)
  const trend = useMemo(() => {
    const revByMonth = groupSum(
      txInPeriod.filter((t) => t.type === "إيراد"),
      (t) => monthKey(t.dateISO),
      (t) => t.amount
    );
    const expByMonth = groupSum(
      txInPeriod.filter((t) => t.type === "مصروف"),
      (t) => monthKey(t.dateISO),
      (t) => t.amount
    );

    // collect month keys sorted
    const keys = Array.from(new Set([...revByMonth.keys(), ...expByMonth.keys()])).sort();
    const rows = keys.map((k) => {
      const r = revByMonth.get(k) || 0;
      const e = expByMonth.get(k) || 0;
      return { month: k, revenue: r, expenses: e, profit: r - e };
    });
    return rows;
  }, [txInPeriod]);

  // expense breakdown
  const expenseBreakdown = useMemo(() => {
    const m = groupSum(
      txInPeriod.filter((t) => t.type === "مصروف"),
      (t) => t.category,
      (t) => t.amount
    );
    const rows = Array.from(m.entries())
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);
    return rows;
  }, [txInPeriod]);

  // top days by payments
  const topDays = useMemo(() => {
    const m = groupSum(paymentsInPeriod, (p) => p.dateISO, (p) => Number(p.amount) || 0);
    return Array.from(m.entries())
      .map(([dateISO, amount]) => ({ dateISO, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 7);
  }, [paymentsInPeriod]);

  // branch leaderboard (when branchFilter = all)
  const branchLeaderboard = useMemo(() => {
    if (branchFilter !== "all") return [];

    const branchIds = branches.map((b) => b.id);
    const rows = branchIds.map((bid) => {
      const bName = branches.find((b) => b.id === bid)?.name ?? "—";

      const bTx = txInPeriod.filter((t) => t.branchId === bid || t.branchId === "all");
      const revenueTx = bTx.filter((t) => t.type === "إيراد").reduce((s, t) => s + (t.amount || 0), 0);
      const expensesTx = bTx.filter((t) => t.type === "مصروف").reduce((s, t) => s + (t.amount || 0), 0);
      const profit = revenueTx - expensesTx;
      const margin = revenueTx > 0 ? (profit / revenueTx) * 100 : 0;

      const bPay = paymentsInPeriod.filter((p) => p.branchId === bid);
      const paySum = bPay.reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const payCount = bPay.length;
      const payAvg = payCount ? paySum / payCount : 0;

      return { bid, name: bName, revenueTx, expensesTx, profit, margin, paySum, payCount, payAvg };
    });

    return rows.sort((a, b) => b.profit - a.profit);
  }, [branchFilter, branches, txInPeriod, paymentsInPeriod]);

  // insights (simple rules)
  const insights = useMemo(() => {
    const out: { tone: "good" | "warn" | "bad"; text: string }[] = [];

    if (summary.revenueTx === 0 && subs.sum > 0) {
      out.push({
        tone: "warn",
        text: "لديك عمليات دفع (payments) لكن الإيرادات في tx صفر. تأكد أن بند اشتراكات التلقائي موجود لهذا الفرع/الفترة.",
      });
    }

    const expUp = prev.expensesTx > 0 ? (summary.expensesTx - prev.expensesTx) / prev.expensesTx : 0;
    if (prev.expensesTx > 0 && expUp >= 0.15) {
      out.push({ tone: "warn", text: `المصاريف ارتفعت ${(expUp * 100).toFixed(0)}% مقارنة بالفترة السابقة.` });
    }

    if (summary.profit < 0) out.push({ tone: "bad", text: "صافي الربح سلبي في هذه الفترة." });

    const salaryShare = summary.expensesTx > 0 ? summary.salaries / summary.expensesTx : 0;
    if (salaryShare >= 0.5) {
      out.push({ tone: "warn", text: `الرواتب تشكل ${(salaryShare * 100).toFixed(0)}% من المصاريف.` });
    }

    if (subs.renewCount === 0 && subs.count > 5) out.push({ tone: "warn", text: "لا توجد تجديدات خلال هذه الفترة (Renew=0)." });

    if (!out.length) out.push({ tone: "good", text: "لا توجد تنبيهات مهمة — الوضع طبيعي حسب القواعد الحالية." });
    return out;
  }, [summary, prev, subs]);

  // compare A vs B (custom tab)
  const compareAB = useMemo(() => {
    const A = { start: clampISO(aStart), end: clampISO(aEnd) };
    const B = { start: clampISO(bStart), end: clampISO(bEnd) };
    const Aok = A.start <= A.end ? A : { start: A.end, end: A.start };
    const Bok = B.start <= B.end ? B : { start: B.end, end: B.start };

    const txA = tx
      .filter((t) => inRangeISO(t.dateISO, Aok.start, Aok.end))
      .filter((t) => (branchFilter === "all" ? true : t.branchId === branchFilter || t.branchId === "all"));
    const txB = tx
      .filter((t) => inRangeISO(t.dateISO, Bok.start, Bok.end))
      .filter((t) => (branchFilter === "all" ? true : t.branchId === branchFilter || t.branchId === "all"));

    const payA = payments
      .filter((p) => inRangeISO(p.dateISO, Aok.start, Aok.end))
      .filter((p) => (branchFilter === "all" ? true : p.branchId === branchFilter));
    const payB = payments
      .filter((p) => inRangeISO(p.dateISO, Bok.start, Bok.end))
      .filter((p) => (branchFilter === "all" ? true : p.branchId === branchFilter));

    const sumTx = (list: FinanceTx[], type: TxType) =>
      list.filter((t) => t.type === type).reduce((s, t) => s + (t.amount || 0), 0);

    const revenueA = sumTx(txA, "إيراد");
    const expA = sumTx(txA, "مصروف");
    const profitA = revenueA - expA;

    const revenueB = sumTx(txB, "إيراد");
    const expB = sumTx(txB, "مصروف");
    const profitB = revenueB - expB;

    const paySumA = payA.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const paySumB = payB.reduce((s, p) => s + (Number(p.amount) || 0), 0);

    return { A: Aok, B: Bok, revenueA, expA, profitA, revenueB, expB, profitB, paySumA, paySumB, payCountA: payA.length, payCountB: payB.length };
  }, [aStart, aEnd, bStart, bEnd, tx, payments, branchFilter]);

  function branchName(id: string | "all") {
    if (id === "all") return "عام (الأكاديمية)";
    return branches.find((b) => b.id === id)?.name ?? "—";
  }

  return (
    <main className="flex-1 p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold">تقارير الإدارة المالية</h1>
            <p className="text-sm text-white/60 mt-1">تقارير شهرية/ربع سنوية/سنوية + Custom Dates + مقارنات. (tx + payments)</p>
          </div>

          <div className="flex items-center gap-3" style={{ direction: "ltr" }}>
            <Link href="/finance" className="h-11 px-5 rounded-xl bg-white/5 hover:bg-white/10 transition font-medium">
              رجوع للإدارة المالية
            </Link>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-[#111827] rounded-2xl p-4 border border-white/5 space-y-4">
          <div className="flex items-end gap-4 flex-wrap">
            <div className="min-w-[260px]">
              <label className="block text-xs text-white/60 mb-2">الفرع</label>
              <select
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value as any)}
                className="w-full h-11 rounded-xl bg-[#0F172A] border border-white/10 px-4 outline-none focus:border-white/25"
              >
                <option value="all">كل الفروع</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="min-w-[220px]">
              <label className="block text-xs text-white/60 mb-2">نوع الفترة</label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as PeriodMode)}
                className="w-full h-11 rounded-xl bg-[#0F172A] border border-white/10 px-4 outline-none focus:border-white/25"
              >
                <option value="month">شهري</option>
                <option value="quarter">ربع سنوي</option>
                <option value="half">نصف سنوي</option>
                <option value="year">سنوي</option>
                <option value="custom">Custom Dates</option>
              </select>
            </div>

            {mode === "month" && (
              <div className="min-w-[220px]">
                <label className="block text-xs text-white/60 mb-2">الشهر</label>
                <input
                  type="month"
                  value={monthSel}
                  onChange={(e) => setMonthSel(e.target.value)}
                  className="w-full h-11 rounded-xl bg-[#0F172A] border border-white/10 px-4 outline-none focus:border-white/25"
                />
              </div>
            )}

            {(mode === "quarter" || mode === "half" || mode === "year") && (
              <div className="min-w-[180px]">
                <label className="block text-xs text-white/60 mb-2">السنة</label>
                <input
                  type="number"
                  value={yearSel}
                  onChange={(e) => setYearSel(Number(e.target.value || new Date().getFullYear()))}
                  className="w-full h-11 rounded-xl bg-[#0F172A] border border-white/10 px-4 outline-none focus:border-white/25"
                />
              </div>
            )}

            {mode === "quarter" && (
              <div className="min-w-[180px]">
                <label className="block text-xs text-white/60 mb-2">الربع</label>
                <select
                  value={quarterSel}
                  onChange={(e) => setQuarterSel(Number(e.target.value) as any)}
                  className="w-full h-11 rounded-xl bg-[#0F172A] border border-white/10 px-4 outline-none focus:border-white/25"
                >
                  <option value={1}>Q1</option>
                  <option value={2}>Q2</option>
                  <option value={3}>Q3</option>
                  <option value={4}>Q4</option>
                </select>
              </div>
            )}

            {mode === "half" && (
              <div className="min-w-[180px]">
                <label className="block text-xs text-white/60 mb-2">النصف</label>
                <select
                  value={halfSel}
                  onChange={(e) => setHalfSel(Number(e.target.value) as any)}
                  className="w-full h-11 rounded-xl bg-[#0F172A] border border-white/10 px-4 outline-none focus:border-white/25"
                >
                  <option value={1}>H1</option>
                  <option value={2}>H2</option>
                </select>
              </div>
            )}

            {mode === "custom" && (
              <>
                <div className="min-w-[220px]">
                  <label className="block text-xs text-white/60 mb-2">من</label>
                  <input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="w-full h-11 rounded-xl bg-[#0F172A] border border-white/10 px-4 outline-none focus:border-white/25"
                  />
                </div>
                <div className="min-w-[220px]">
                  <label className="block text-xs text-white/60 mb-2">إلى</label>
                  <input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="w-full h-11 rounded-xl bg-[#0F172A] border border-white/10 px-4 outline-none focus:border-white/25"
                  />
                </div>
              </>
            )}

            <div className="text-xs text-white/60">
              الفترة: <span className="text-white">{period.start}</span> → <span className="text-white">{period.end}</span>
              <span className="mx-2">|</span>
              مقارنة تلقائية: <span className="text-white">{prevPeriod.start}</span> → <span className="text-white">{prevPeriod.end}</span>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-2 flex-wrap">
            <TabButton active={tab === "overview"} onClick={() => setTab("overview")} label="نظرة عامة" />
            <TabButton active={tab === "revenue"} onClick={() => setTab("revenue")} label="الإيرادات" />
            <TabButton active={tab === "expenses"} onClick={() => setTab("expenses")} label="المصاريف" />
            <TabButton active={tab === "branches"} onClick={() => setTab("branches")} label="الفروع" />
            <TabButton active={tab === "compare"} onClick={() => setTab("compare")} label="مقارنة مخصصة" />
          </div>
        </div>

        {/* KPI */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Card title="إيرادات (tx)" value={money(summary.revenueTx)} />
          <Card title="مصاريف (tx)" value={money(summary.expensesTx)} />
          <Card title="صافي الربح" value={money(summary.profit)} emphasize={summary.profit >= 0 ? "good" : "bad"} />
          <Card title="هامش الربح" value={pct(summary.margin)} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Card title="عمليات الدفع (payments)" value={`${subs.count} عملية`} />
          <Card title="مجموع الاشتراكات (payments)" value={money(subs.sum)} />
          <Card title="متوسط الدفع" value={money(subs.avg)} />
          <Card title="جديد / تجديد" value={`${subs.newCount} / ${subs.renewCount}`} />
        </div>

        {/* Compare vs previous */}
        <div className="bg-[#111827] rounded-2xl p-4 border border-white/5">
          <div className="text-sm text-white/70 mb-3">مقارنة تلقائية مع الفترة السابقة</div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <DeltaCard title="فرق الإيراد" value={deltas.dRevenue} />
            <DeltaCard title="فرق المصروف" value={deltas.dExpenses} inverse />
            <DeltaCard title="فرق الربح" value={deltas.dProfit} />
            <DeltaCard title="فرق الاشتراكات" value={deltas.dSubsSum} />
            <DeltaCard title="فرق عدد العمليات" value={deltas.dSubsCount} />
          </div>
        </div>

        {/* Content */}
        {tab === "overview" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Panel title="Trend داخل الفترة (حسب الأشهر)">
              {trend.length === 0 ? (
                <div className="text-white/60 text-sm">لا توجد بيانات trend للفترة.</div>
              ) : (
                <div className="space-y-2">
                  {trend.map((r) => (
                    <div key={r.month} className="flex items-center justify-between text-sm">
                      <div className="text-white/70">{r.month}</div>
                      <div className="text-white">
                        {money(r.revenue)} <span className="text-white/30">|</span> {money(r.expenses)} <span className="text-white/30">|</span>{" "}
                        <span className={r.profit >= 0 ? "text-emerald-300" : "text-red-300"}>{money(r.profit)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="توزيع المصاريف حسب التصنيف">
              {expenseBreakdown.length === 0 ? (
                <div className="text-white/60 text-sm">لا توجد مصاريف في هذه الفترة.</div>
              ) : (
                <div className="space-y-2">
                  {expenseBreakdown.slice(0, 7).map((x) => (
                    <div key={x.category} className="flex items-center justify-between text-sm">
                      <div className="text-white/70">{x.category}</div>
                      <div className="text-white">{money(x.amount)}</div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="Insights (تنبيهات سريعة)">
              <div className="space-y-2">
                {insights.map((i, idx) => (
                  <div
                    key={idx}
                    className={`text-sm rounded-xl px-3 py-2 border ${
                      i.tone === "good"
                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-200"
                        : i.tone === "warn"
                        ? "bg-amber-500/10 border-amber-500/20 text-amber-200"
                        : "bg-red-500/10 border-red-500/20 text-red-200"
                    }`}
                  >
                    {i.text}
                  </div>
                ))}
              </div>
            </Panel>

            <div className="lg:col-span-3">
              <Panel title="Top Days (أعلى الأيام دخلًا من payments)">
                {topDays.length === 0 ? (
                  <div className="text-white/60 text-sm">لا توجد عمليات دفع في هذه الفترة.</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    {topDays.map((d) => (
                      <div key={d.dateISO} className="rounded-xl bg-white/5 border border-white/10 p-3 flex items-center justify-between">
                        <div className="text-sm text-white/70">{d.dateISO}</div>
                        <div className="text-sm text-white">{money(d.amount)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </div>
          </div>
        )}

        {tab === "revenue" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Panel title="ملخص الاشتراكات (payments)">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <K title="عدد العمليات" v={`${subs.count}`} />
                <K title="المجموع" v={money(subs.sum)} />
                <K title="المتوسط" v={money(subs.avg)} />
                <K title="جديد/تجديد" v={`${subs.newCount} / ${subs.renewCount}`} />
              </div>
            </Panel>

            <Panel title="إيرادات (tx) داخل الفترة">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <K title="إيراد (tx)" v={money(summary.revenueTx)} />
                <K title="فرق الإيراد" v={`${deltas.dRevenue >= 0 ? "+" : "-"}${money(Math.abs(deltas.dRevenue))}`} />
                <K title="مجموع اشتراكات (payments)" v={money(subs.sum)} />
                <K title="فرق الاشتراكات" v={`${deltas.dSubsSum >= 0 ? "+" : "-"}${money(Math.abs(deltas.dSubsSum))}`} />
              </div>
              <div className="text-xs text-white/50 mt-3">
                * إذا كان “payments” أعلى من “إيراد tx” فهذا غالبًا يعني بند اشتراكات التلقائي غير موجود/غير مُحدَّث.
              </div>
            </Panel>

            <div className="lg:col-span-2">
              <Panel title="قائمة عمليات الدفع (آخر 50 في الفترة)">
                <div className="overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="text-white/60">
                      <tr>
                        <th className="text-right py-2">التاريخ</th>
                        <th className="text-right py-2">الفرع</th>
                        <th className="text-right py-2">النوع</th>
                        <th className="text-right py-2">المبلغ</th>
                        <th className="text-right py-2">ملاحظة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paymentsInPeriod.slice(0, 50).map((p) => (
                        <tr key={p.id} className="border-t border-white/10">
                          <td className="py-2 text-white/80">{p.dateISO}</td>
                          <td className="py-2 text-white/80">{branchName(p.branchId)}</td>
                          <td className="py-2 text-white/80">{p.kind === "new" ? "جديد" : p.kind === "legacy" ? "مستورد" : "تجديد"}</td>
                          <td className="py-2 text-white/80">{money(p.amount)}</td>
                          <td className="py-2 text-white/60">{p.note || "—"}</td>
                        </tr>
                      ))}
                      {paymentsInPeriod.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-4 text-white/60">
                            لا توجد عمليات دفع للفترة.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </div>
          </div>
        )}

        {tab === "expenses" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Panel title="ملخص المصاريف">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <K title="مصاريف (tx)" v={money(summary.expensesTx)} />
                <K title="فرق المصاريف" v={`${deltas.dExpenses >= 0 ? "+" : "-"}${money(Math.abs(deltas.dExpenses))}`} />
                <K title="رواتب" v={money(summary.salaries)} />
                <K title="ملعب" v={money(summary.field)} />
              </div>
            </Panel>

            <Panel title="توزيع المصاريف (Top 8)">
              {expenseBreakdown.length === 0 ? (
                <div className="text-white/60 text-sm">لا توجد مصاريف.</div>
              ) : (
                <div className="space-y-2">
                  {expenseBreakdown.slice(0, 8).map((x) => (
                    <div key={x.category} className="flex items-center justify-between text-sm">
                      <div className="text-white/70">{x.category}</div>
                      <div className="text-white">{money(x.amount)}</div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <div className="lg:col-span-2">
              <Panel title="بنود المصاريف (آخر 100 في الفترة)">
                <div className="overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="text-white/60">
                      <tr>
                        <th className="text-right py-2">التاريخ</th>
                        <th className="text-right py-2">التصنيف</th>
                        <th className="text-right py-2">الفرع</th>
                        <th className="text-right py-2">المبلغ</th>
                        <th className="text-right py-2">المصدر</th>
                        <th className="text-right py-2">ملاحظة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {txInPeriod
                        .filter((t) => t.type === "مصروف")
                        .slice(0, 100)
                        .map((t) => (
                          <tr key={t.id} className="border-t border-white/10">
                            <td className="py-2 text-white/80">{t.dateISO}</td>
                            <td className="py-2 text-white/80">{t.category}</td>
                            <td className="py-2 text-white/80">{branchName(t.branchId)}</td>
                            <td className="py-2 text-white/80">{money(t.amount)}</td>
                            <td className="py-2 text-white/60">{t.source === "auto" ? "تلقائي" : "يدوي"}</td>
                            <td className="py-2 text-white/60">{t.note || "—"}</td>
                          </tr>
                        ))}
                      {txInPeriod.filter((t) => t.type === "مصروف").length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-4 text-white/60">
                            لا توجد مصاريف في الفترة.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </div>
          </div>
        )}

        {tab === "branches" && (
          <div className="space-y-4">
            {branchFilter !== "all" ? (
              <Panel title="الفروع">
                <div className="text-white/60 text-sm">اختر “كل الفروع” من الفلتر لعرض المقارنات بين الفروع.</div>
              </Panel>
            ) : (
              <Panel title="Leaderboard الفروع (مرتّب حسب الربح)">
                <div className="overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="text-white/60">
                      <tr>
                        <th className="text-right py-2">الفرع</th>
                        <th className="text-right py-2">إيراد (tx)</th>
                        <th className="text-right py-2">مصروف (tx)</th>
                        <th className="text-right py-2">ربح</th>
                        <th className="text-right py-2">هامش</th>
                        <th className="text-right py-2">عمليات دفع</th>
                        <th className="text-right py-2">متوسط</th>
                      </tr>
                    </thead>
                    <tbody>
                      {branchLeaderboard.map((r) => (
                        <tr key={r.bid} className="border-t border-white/10">
                          <td className="py-2 text-white/80">{r.name}</td>
                          <td className="py-2 text-white/80">{money(r.revenueTx)}</td>
                          <td className="py-2 text-white/80">{money(r.expensesTx)}</td>
                          <td className={`py-2 ${r.profit >= 0 ? "text-emerald-300" : "text-red-300"}`}>{money(r.profit)}</td>
                          <td className="py-2 text-white/80">{pct(r.margin)}</td>
                          <td className="py-2 text-white/80">{r.payCount}</td>
                          <td className="py-2 text-white/80">{money(r.payAvg)}</td>
                        </tr>
                      ))}
                      {branchLeaderboard.length === 0 && (
                        <tr>
                          <td colSpan={7} className="py-4 text-white/60">
                            لا توجد بيانات فروع للفترة.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Panel>
            )}
          </div>
        )}

        {tab === "compare" && (
          <div className="space-y-4">
            <Panel title="مقارنة مخصصة Period A vs Period B">
              <div className="flex items-end gap-3 flex-wrap">
                <div className="min-w-[220px]">
                  <label className="block text-xs text-white/60 mb-2">A من</label>
                  <input
                    type="date"
                    value={aStart}
                    onChange={(e) => setAStart(e.target.value)}
                    className="w-full h-11 rounded-xl bg-[#0F172A] border border-white/10 px-4 outline-none focus:border-white/25"
                  />
                </div>
                <div className="min-w-[220px]">
                  <label className="block text-xs text-white/60 mb-2">A إلى</label>
                  <input
                    type="date"
                    value={aEnd}
                    onChange={(e) => setAEnd(e.target.value)}
                    className="w-full h-11 rounded-xl bg-[#0F172A] border border-white/10 px-4 outline-none focus:border-white/25"
                  />
                </div>

                <div className="min-w-[220px]">
                  <label className="block text-xs text-white/60 mb-2">B من</label>
                  <input
                    type="date"
                    value={bStart}
                    onChange={(e) => setBStart(e.target.value)}
                    className="w-full h-11 rounded-xl bg-[#0F172A] border border-white/10 px-4 outline-none focus:border-white/25"
                  />
                </div>
                <div className="min-w-[220px]">
                  <label className="block text-xs text-white/60 mb-2">B إلى</label>
                  <input
                    type="date"
                    value={bEnd}
                    onChange={(e) => setBEnd(e.target.value)}
                    className="w-full h-11 rounded-xl bg-[#0F172A] border border-white/10 px-4 outline-none focus:border-white/25"
                  />
                </div>

                <div className="text-xs text-white/60">
                  الفرع: <span className="text-white">{branchFilter === "all" ? "كل الفروع" : branchName(branchFilter)}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
                <Card title="A إيراد/مصروف/ربح" value={`${money(compareAB.revenueA)} | ${money(compareAB.expA)} | ${money(compareAB.profitA)}`} />
                <Card title="B إيراد/مصروف/ربح" value={`${money(compareAB.revenueB)} | ${money(compareAB.expB)} | ${money(compareAB.profitB)}`} />
                <Card
                  title="فرق الربح (A - B)"
                  value={`${compareAB.profitA - compareAB.profitB >= 0 ? "+" : "-"}${money(Math.abs(compareAB.profitA - compareAB.profitB))}`}
                  emphasize={compareAB.profitA - compareAB.profitB >= 0 ? "good" : "bad"}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                <Card title="A اشتراكات payments" value={`${money(compareAB.paySumA)} | ${compareAB.payCountA} عملية`} />
                <Card title="B اشتراكات payments" value={`${money(compareAB.paySumB)} | ${compareAB.payCountB} عملية`} />
                <Card
                  title="فرق الاشتراكات (A - B)"
                  value={`${compareAB.paySumA - compareAB.paySumB >= 0 ? "+" : "-"}${money(Math.abs(compareAB.paySumA - compareAB.paySumB))}`}
                />
              </div>
            </Panel>
          </div>
        )}
      </main>
  );
}

// ---------- UI ----------
function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`h-10 px-4 rounded-xl border transition text-sm ${
        active ? "bg-white/10 border-white/20 text-white" : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10"
      }`}
    >
      {label}
    </button>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-[#111827] border border-white/5 p-4">
      <div className="text-sm text-white/70 mb-3">{title}</div>
      {children}
    </div>
  );
}

function Card({
  title,
  value,
  emphasize,
}: {
  title: string;
  value: string;
  emphasize?: "good" | "bad";
}) {
  const cls =
    emphasize === "good"
      ? "text-emerald-300"
      : emphasize === "bad"
      ? "text-red-300"
      : "text-white";

  return (
    <div className="rounded-2xl bg-[#111827] border border-white/5 p-4">
      <div className="text-xs text-white/60">{title}</div>
      <div className={`text-lg font-bold mt-1 ${cls}`}>{value}</div>
    </div>
  );
}

function DeltaCard({
  title,
  value,
  inverse,
}: {
  title: string;
  value: number;
  inverse?: boolean; // للمصروف: الزيادة تعتبر سيئة
}) {
  const positive = value >= 0;
  const good = inverse ? !positive : positive;
  const cls = good ? "text-emerald-300" : "text-red-300";

  return (
    <div className="rounded-2xl bg-[#0B1220] border border-white/10 p-4">
      <div className="text-xs text-white/60">{title}</div>
      <div className={`text-lg font-bold mt-1 ${cls}`}>
        {value >= 0 ? "+" : "-"}
        {money(Math.abs(value))}
      </div>
    </div>
  );
}

function K({ title, v }: { title: string; v: string }) {
  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-3">
      <div className="text-xs text-white/60">{title}</div>
      <div className="text-sm text-white mt-1">{v}</div>
    </div>
  );
}