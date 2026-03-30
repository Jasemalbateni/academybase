"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  AreaChart,
  Area,
  Legend,
  Cell,
  ReferenceLine,
} from "recharts";
import { listPlayers,              type DbPlayer     } from "@/src/lib/supabase/players";
import { listPayments,             type DbPayment    } from "@/src/lib/supabase/payments";
import { listFinanceTx,            type DbFinanceTx  } from "@/src/lib/supabase/finance";
import { listBranches,             type DbBranch     } from "@/src/lib/supabase/branches";
import { listAttendanceByDateRange, type DbAttendance } from "@/src/lib/supabase/attendance";

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayISO() {
  return new Date().toISOString().slice(0, 10);
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

function lastNMonths(n: number, fromYM: string): string[] {
  const months: string[] = [];
  let cur = fromYM;
  for (let i = 0; i < n; i++) {
    months.unshift(cur);
    cur = prevMonthKey(cur);
  }
  return months;
}

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const formatKD = (value: number) =>
  new Intl.NumberFormat("ar-KW", {
    style:                "currency",
    currency:             "KWD",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);

const ARABIC_MONTHS: Record<string, string> = {
  "01": "يناير", "02": "فبراير", "03": "مارس",
  "04": "أبريل", "05": "مايو",   "06": "يونيو",
  "07": "يوليو", "08": "أغسطس",  "09": "سبتمبر",
  "10": "أكتوبر","11": "نوفمبر", "12": "ديسمبر",
};

function shortMonthLabel(ym: string): string {
  const [, m] = ym.split("-");
  return ARABIC_MONTHS[m] ?? ym;
}

type RangeOption = "3" | "6" | "12";

// ── Card wrapper ──────────────────────────────────────────────────────────────

function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/10 bg-white/5 backdrop-blur",
        "shadow-[0_10px_30px_rgba(0,0,0,0.25)]",
        className
      )}
    >
      {children}
    </div>
  );
}

// ── Custom Tooltips ───────────────────────────────────────────────────────────

function FinanceTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: readonly { dataKey: string; value: number; color: string }[];
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  const rev = payload.find((p) => p.dataKey === "revenue")?.value ?? 0;
  const exp = payload.find((p) => p.dataKey === "expenses")?.value ?? 0;
  const net = payload.find((p) => p.dataKey === "net")?.value ?? 0;
  return (
    <div className="rounded-xl border border-white/10 bg-[#0B1220]/95 px-4 py-3 text-xs text-white shadow-xl">
      <div className="mb-2 font-semibold text-white/90">
        {shortMonthLabel(String(label ?? ""))}
      </div>
      <div className="space-y-1">
        <div className="flex justify-between gap-8">
          <span className="text-emerald-300">الإيراد</span>
          <span className="font-semibold">{formatKD(rev)}</span>
        </div>
        <div className="flex justify-between gap-8">
          <span className="text-white/60">المصاريف</span>
          <span className="font-semibold">{formatKD(exp)}</span>
        </div>
        <div className="flex justify-between gap-8">
          <span className="text-green-300">الصافي</span>
          <span className={cn("font-semibold", net >= 0 ? "text-green-300" : "text-red-300")}>
            {formatKD(net)}
          </span>
        </div>
      </div>
    </div>
  );
}

function RenewalTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: readonly { payload: { renew: number; news: number; rate: number } }[];
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  return (
    <div className="rounded-xl border border-white/10 bg-[#0B1220]/95 px-4 py-3 text-xs text-white shadow-xl">
      <div className="mb-2 font-semibold text-white/90">
        {shortMonthLabel(String(label ?? ""))}
      </div>
      <div className="space-y-1">
        <div className="flex justify-between gap-8">
          <span className="text-white/70">نسبة التجديد</span>
          <span className="font-semibold">{row?.rate ?? 0}%</span>
        </div>
        <div className="flex justify-between gap-8">
          <span className="text-white/70">مجدد</span>
          <span className="font-semibold">{row?.renew ?? 0}</span>
        </div>
        <div className="flex justify-between gap-8">
          <span className="text-white/70">جديد</span>
          <span className="font-semibold">{row?.news ?? 0}</span>
        </div>
      </div>
    </div>
  );
}

function AttendanceTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: readonly { payload: { total: number; present: number; rate: number } }[];
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  return (
    <div className="rounded-xl border border-white/10 bg-[#0B1220]/95 px-4 py-3 text-xs text-white shadow-xl">
      <div className="mb-2 font-semibold text-white/90">
        {shortMonthLabel(String(label ?? ""))}
      </div>
      <div className="space-y-1">
        <div className="flex justify-between gap-8">
          <span className="text-white/70">جلسات مسجّلة</span>
          <span className="font-semibold">{row?.total ?? 0}</span>
        </div>
        <div className="flex justify-between gap-8">
          <span className="text-emerald-300">حضور</span>
          <span className="font-semibold">{row?.present ?? 0}</span>
        </div>
        <div className="flex justify-between gap-8">
          <span className="text-white/70">معدل الحضور</span>
          <span className="font-semibold">{row?.rate ?? 0}%</span>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function StatisticsPage() {
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  const [players,    setPlayers]    = useState<DbPlayer[]>([]);
  const [payments,   setPayments]   = useState<DbPayment[]>([]);
  const [finance,    setFinance]    = useState<DbFinanceTx[]>([]);
  const [branches,   setBranches]   = useState<DbBranch[]>([]);
  const [attendance, setAttendance] = useState<DbAttendance[]>([]);

  const [range,        setRange]        = useState<RangeOption>("6");
  const [branchFilter, setBranchFilter] = useState<string>("all");

  const defaultMonth = useMemo(() => monthKey(todayISO()), []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        // Statistics charts show max 12 months; fetch exactly that window.
        const last12 = lastNMonths(12, monthKey(todayISO()));

        const [dbPlayers, dbPayments, dbFinance, dbBranches] = await Promise.all([
          listPlayers(),
          listPayments(),
          listFinanceTx(last12),
          listBranches(),
        ]);
        if (cancelled) return;
        setPlayers(dbPlayers);
        setPayments(dbPayments);
        setFinance(dbFinance.filter((t) => t.source !== "suppressed"));
        setBranches(dbBranches);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "خطأ في تحميل البيانات");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  // Attendance loaded separately — re-fetches when range or defaultMonth changes
  useEffect(() => {
    let cancelled = false;
    const months  = lastNMonths(Number(range), defaultMonth);
    const fromDate = `${months[0]}-01`;
    const [ey, em] = months[months.length - 1].split("-").map(Number);
    const toDate   = `${months[months.length - 1]}-${String(new Date(ey, em, 0).getDate()).padStart(2, "0")}`;

    listAttendanceByDateRange(fromDate, toDate)
      .then((rows) => { if (!cancelled) setAttendance(rows); })
      .catch(() => { if (!cancelled) setAttendance([]); });

    return () => { cancelled = true; };
  }, [range, defaultMonth]);

  // ── Chart 1: Finance trend ─────────────────────────────────────────────────
  const financeTrend = useMemo(() => {
    const months = lastNMonths(Number(range), defaultMonth);
    return months.map((ym) => {
      const list     = finance.filter((t) => t.month === ym);
      const revenue  = list.filter((t) => t.type === "إيراد").reduce((s, t) => s + Number(t.amount), 0);
      const expenses = list.filter((t) => t.type === "مصروف").reduce((s, t) => s + Number(t.amount), 0);
      return { month: ym, label: shortMonthLabel(ym), revenue, expenses, net: revenue - expenses };
    });
  }, [finance, range, defaultMonth]);

  // ── Chart 2: Renewal rate trend ────────────────────────────────────────────
  const renewalTrend = useMemo(() => {
    const months = lastNMonths(Number(range), defaultMonth);
    return months.map((ym) => {
      const ymPayments = payments.filter((p) => p.date?.slice(0, 7) === ym);
      // Exclude legacy-import payments — imported players are not new subscribers
      const playerIds  = new Set(ymPayments.filter((p) => p.kind !== "legacy").map((p) => p.player_id).filter(Boolean));
      let renew = 0, news = 0;
      for (const pid of playerIds) {
        const all = payments
          .filter((p) => p.player_id === pid)
          .sort((a, b) => a.date.localeCompare(b.date));
        if (all[0]?.date?.slice(0, 7) === ym) news++;
        else renew++;
      }
      const total = renew + news;
      return { month: ym, label: shortMonthLabel(ym), renew, news, rate: total === 0 ? 0 : Math.round((renew / total) * 100) };
    });
  }, [payments, range, defaultMonth]);

  // ── Chart 3: Birth Year Distribution (مواليد) ──────────────────────────────
  const birthYearDistribution = useMemo(() => {
    const filtered =
      branchFilter === "all"
        ? players
        : players.filter((p) => p.branch_id === branchFilter);

    const currentYear = new Date().getFullYear();
    const yearCounts: Record<number, number> = {};

    for (const p of filtered) {
      const year = parseInt(p.birth?.slice(0, 4) ?? "0");
      if (year >= 1990 && year <= currentYear) {
        yearCounts[year] = (yearCounts[year] ?? 0) + 1;
      }
    }

    return Object.entries(yearCounts)
      .map(([year, count]) => ({
        year:  parseInt(year),
        label: String(year),
        count,
      }))
      .sort((a, b) => a.year - b.year);
  }, [players, branchFilter]);

  // ── Chart 4: Seasonality (new subscriptions by month-of-year) ─────────────
  const seasonality = useMemo(() => {
    const monthlyCounts: Record<string, number> = {};
    for (let m = 1; m <= 12; m++) {
      monthlyCounts[String(m).padStart(2, "0")] = 0;
    }
    for (const p of payments) {
      if (p.kind !== "new") continue;
      const month = p.date?.slice(5, 7);
      if (month && monthlyCounts[month] !== undefined) monthlyCounts[month]++;
    }
    return Object.entries(monthlyCounts).map(([m, count]) => ({
      label: ARABIC_MONTHS[m] ?? m,
      month: m,
      count,
    }));
  }, [payments]);

  // ── Chart 5: Day-of-month distribution for new subscriptions ───────────────
  const dayOfMonthData = useMemo(() => {
    const months  = lastNMonths(Number(range), defaultMonth);
    const monthSet = new Set(months);

    const filtered = payments.filter((p) => {
      if (p.kind !== "new") return false;
      if (!monthSet.has(p.date?.slice(0, 7))) return false;
      if (branchFilter !== "all" && p.branch_id !== branchFilter) return false;
      return true;
    });

    const dayCounts = new Array(31).fill(0);
    for (const p of filtered) {
      const day = parseInt(p.date?.slice(8, 10) ?? "0") - 1;
      if (day >= 0 && day < 31) dayCounts[day]++;
    }

    return Array.from({ length: 31 }, (_, i) => ({
      day:   i + 1,
      label: String(i + 1),
      count: dayCounts[i],
    }));
  }, [payments, branchFilter, range, defaultMonth]);

  // ── Chart E: Attendance rate — respects range selector ───────────────────
  // Rate = present / total records (only explicitly recorded sessions count).
  const attendanceTrend = useMemo(() => {
    const months = lastNMonths(Number(range), defaultMonth);
    return months.map((ym) => {
      const recs = attendance.filter((r) => r.date.slice(0, 7) === ym);
      const filtered =
        branchFilter === "all"
          ? recs
          : recs.filter((r) => r.branch_id === branchFilter);
      const total   = filtered.length;
      const present = filtered.filter((r) => r.present).length;
      const rate    = total === 0 ? 0 : Math.round((present / total) * 100);
      return { month: ym, label: shortMonthLabel(ym), total, present, rate };
    });
  }, [attendance, branchFilter, defaultMonth, range]);

  // Peak window: 5-day rolling max
  const peakWindow = useMemo(() => {
    if (dayOfMonthData.every((d) => d.count === 0)) return null;
    let bestSum = 0;
    let bestStart = 0;
    for (let i = 0; i <= 26; i++) {
      const sum = dayOfMonthData.slice(i, i + 5).reduce((s, d) => s + d.count, 0);
      if (sum > bestSum) { bestSum = sum; bestStart = i; }
    }
    return bestSum > 0
      ? { from: bestStart + 1, to: bestStart + 5, total: bestSum }
      : null;
  }, [dayOfMonthData]);

  // ── Summary KPIs ───────────────────────────────────────────────────────────
  const activePlayers = players.filter((p) => p.end_date && p.end_date >= todayISO()).length;
  const avgRevenue = useMemo(() => {
    const months   = lastNMonths(Number(range), defaultMonth);
    const revenues = months.map((ym) =>
      finance.filter((t) => t.month === ym && t.type === "إيراد").reduce((s, t) => s + Number(t.amount), 0)
    );
    const sum = revenues.reduce((a, b) => a + b, 0);
    return months.length ? Math.round(sum / months.length) : 0;
  }, [finance, range, defaultMonth]);

  const maxSeasonMonth = useMemo(() => {
    const top = seasonality.reduce((a, b) => (b.count > a.count ? b : a), { label: "—", count: 0, month: "" });
    return top.count > 0 ? top.label : "—";
  }, [seasonality]);

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <div className="text-white/60 text-sm">جاري تحميل الإحصائيات...</div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex-1 flex items-center justify-center p-8">
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-8 text-center max-w-sm">
          <div className="text-red-300 font-semibold mb-2">خطأ في التحميل</div>
          <div className="text-white/60 text-sm">{error}</div>
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

      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-sm text-white/60">الإحصائيات والتحليلات</div>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight">
              لوحة الإحصائيات 📊
            </h1>
            <div className="mt-1 text-sm text-white/50">
              تحليل شامل لأداء الأكاديمية عبر الزمن
            </div>
          </div>

          {/* Filters row */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Branch filter */}
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="h-11 rounded-xl bg-[#0B1220] border border-white/10 px-4 text-sm text-white outline-none focus:border-white/20"
            >
              <option value="all">كل الفروع</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>

            {/* Time range selector */}
            <div className="flex items-center gap-1 rounded-xl bg-white/5 border border-white/10 p-1">
              {(["3", "6", "12"] as RangeOption[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRange(r)}
                  className={cn(
                    "rounded-lg px-4 py-1.5 text-sm transition",
                    range === r
                      ? "bg-emerald-400/20 text-emerald-300 font-semibold"
                      : "text-white/50 hover:text-white/80"
                  )}
                >
                  {r} أشهر
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Summary KPIs */}
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            { label: "إجمالي اللاعبين",     value: String(players.length), color: "text-emerald-300" },
            { label: "لاعبون نشطون",         value: String(activePlayers),  color: "text-blue-300" },
            { label: "مدفوعات مسجّلة",       value: String(payments.length), color: "text-amber-300" },
            { label: "متوسط الإيراد الشهري", value: formatKD(avgRevenue),   color: "text-purple-300" },
          ].map(({ label, value, color }) => (
            <Card key={label} className="p-5">
              <div className="text-xs text-white/55">{label}</div>
              <div className={cn("mt-2 text-3xl font-extrabold", color)}>{value}</div>
            </Card>
          ))}
        </div>

        {/* Row 1: Finance + Renewal */}
        <div className="mt-6 grid gap-6 md:grid-cols-2">

          {/* Finance Trend */}
          <Card className="p-6">
            <div className="text-sm text-white/60">📈 الإيرادات والمصاريف والصافي</div>
            <div className="mt-1 text-lg font-bold">آخر {range} أشهر</div>
            <div className="mt-4 h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={financeTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.65)", fontSize: 11 }} />
                  <YAxis tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 11 }} />
                  <Tooltip
                    content={({ active, payload, label }) => (
                      <FinanceTooltip
                        active={active}
                        payload={payload as { dataKey: string; value: number; color: string }[]}
                        label={financeTrend.find((d) => d.label === label)?.month ?? label}
                      />
                    )}
                  />
                  <Legend
                    formatter={(v) => v === "revenue" ? "الإيراد" : v === "expenses" ? "المصاريف" : "الصافي"}
                    wrapperStyle={{ fontSize: "12px", color: "rgba(255,255,255,0.65)" }}
                  />
                  <Area type="monotone" dataKey="revenue"  stroke="rgba(99,192,176,0.9)"   fill="rgba(99,192,176,0.12)"  strokeWidth={2} />
                  <Area type="monotone" dataKey="expenses" stroke="rgba(255,255,255,0.45)" fill="rgba(255,255,255,0.06)" strokeWidth={2} />
                  <Area type="monotone" dataKey="net"      stroke="rgba(34,197,94,0.9)"    fill="rgba(34,197,94,0.10)"   strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Renewal Rate Trend */}
          <Card className="p-6">
            <div className="text-sm text-white/60">🔄 نسبة التجديد الشهرية</div>
            <div className="mt-1 text-lg font-bold">آخر {range} أشهر</div>
            <div className="mt-4 h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={renewalTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.65)", fontSize: 11 }} />
                  <YAxis tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 11 }} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                  <Tooltip content={({ active, payload, label }) => (
                    <RenewalTooltip
                      active={active}
                      payload={payload as readonly { payload: { renew: number; news: number; rate: number } }[]}
                      label={label}
                    />
                  )} />
                  <Bar dataKey="rate" name="نسبة التجديد %" radius={[8, 8, 0, 0]}>
                    {renewalTrend.map((entry, i) => (
                      <Cell
                        key={`r-${i}`}
                        fill={entry.rate >= 70 ? "rgba(99,192,176,0.85)" : entry.rate >= 50 ? "rgba(251,191,36,0.75)" : "rgba(239,68,68,0.75)"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 text-xs text-white/40 text-center">
              أخضر ≥70% · أصفر 50–69% · أحمر &lt;50%
            </div>
          </Card>
        </div>

        {/* Row 2: Birth Year + Seasonality */}
        <div className="mt-6 grid gap-6 md:grid-cols-2">

          {/* Birth Year Distribution (مواليد) */}
          <Card className="p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm text-white/60">🎂 توزيع المواليد</div>
                <div className="mt-1 text-lg font-bold">اللاعبون حسب سنة الميلاد</div>
                {branchFilter !== "all" && (
                  <div className="mt-0.5 text-xs text-white/45">
                    فلتر: {branches.find((b) => b.id === branchFilter)?.name}
                  </div>
                )}
              </div>
              <div className="text-xs text-white/40 text-left">
                <div>{birthYearDistribution.length} سنة</div>
                <div>مسجّلة</div>
              </div>
            </div>

            {birthYearDistribution.length === 0 ? (
              <div className="mt-8 text-center text-sm text-white/40">
                لا توجد بيانات مواليد
              </div>
            ) : (
              <div className="mt-4 h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={birthYearDistribution}
                    margin={{ top: 10, right: 10, left: 0, bottom: 30 }}
                  >
                    <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: "rgba(255,255,255,0.65)", fontSize: 10 }}
                      angle={-45}
                      textAnchor="end"
                      height={50}
                    />
                    <YAxis
                      tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 11 }}
                      allowDecimals={false}
                    />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        return (
                          <div className="rounded-xl border border-white/10 bg-[#0B1220]/95 px-4 py-3 text-xs text-white shadow-xl">
                            <div className="font-semibold mb-1">مواليد {String(label)}</div>
                            <div>
                              عدد اللاعبين:{" "}
                              <span className="font-bold text-emerald-300">
                                {String(payload[0]?.value ?? 0)}
                              </span>
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="count" name="اللاعبون" radius={[5, 5, 0, 0]}>
                      {birthYearDistribution.map((entry, i) => {
                        // Color gradient: earlier years = blue, recent = emerald
                        const ratio =
                          birthYearDistribution.length > 1
                            ? i / (birthYearDistribution.length - 1)
                            : 0.5;
                        const r = Math.round(99 + (34 - 99) * ratio);
                        const g = Math.round(192 + (197 - 192) * ratio);
                        const b = Math.round(176 + (94 - 176) * ratio);
                        return (
                          <Cell
                            key={`by-${i}`}
                            fill={`rgba(${r},${g},${b},0.8)`}
                          />
                        );
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          {/* Seasonality — best months for new subscriptions */}
          <Card className="p-6">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-sm text-white/60">🗓️ الموسمية السنوية</div>
                <div className="mt-1 text-lg font-bold">أفضل أشهر التسجيل الجديد</div>
                <div className="mt-0.5 text-xs text-white/45">
                  الشهر الأعلى تاريخياً:{" "}
                  <span className="text-amber-300 font-semibold">{maxSeasonMonth}</span>
                </div>
              </div>
            </div>
            <div className="mt-4 h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={seasonality}
                  margin={{ top: 10, right: 10, left: 0, bottom: 30 }}
                >
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: "rgba(255,255,255,0.65)", fontSize: 10 }}
                    angle={-30}
                    textAnchor="end"
                    height={45}
                  />
                  <YAxis tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 11 }} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="rounded-xl border border-white/10 bg-[#0B1220]/95 px-4 py-3 text-xs text-white shadow-xl">
                          <div className="font-semibold mb-1">{String(label)}</div>
                          <div>
                            اشتراكات جديدة:{" "}
                            <span className="font-bold text-amber-300">
                              {String(payload[0]?.value ?? 0)}
                            </span>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="count" name="اشتراكات جديدة" radius={[5, 5, 0, 0]}>
                    {seasonality.map((entry, i) => {
                      const maxVal = Math.max(...seasonality.map((s) => s.count));
                      return (
                        <Cell
                          key={`s-${i}`}
                          fill={
                            entry.count === maxVal && maxVal > 0
                              ? "rgba(251,191,36,0.85)"
                              : "rgba(99,192,176,0.6)"
                          }
                        />
                      );
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        {/* Row 3: Attendance rate — respects range selector, full width */}
        <div className="mt-6">
          <Card className="p-6">
            <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="text-sm text-white/60">✅ معدل الحضور</div>
                <div className="mt-1 text-lg font-bold">آخر {range} أشهر</div>
                {branchFilter !== "all" && (
                  <div className="mt-0.5 text-xs text-white/45">
                    فلتر: {branches.find((b) => b.id === branchFilter)?.name}
                  </div>
                )}
              </div>
              <div className="text-xs text-white/40 shrink-0 text-left">
                <div>أخضر ≥80% · أصفر 60–79% · أحمر &lt;60%</div>
              </div>
            </div>

            {attendance.length === 0 ? (
              <div className="mt-8 text-center text-sm text-white/40 py-10">
                لا توجد سجلات حضور للفترة المختارة
              </div>
            ) : (
              <div className="mt-4 h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={attendanceTrend}
                    margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                    barSize={56}
                  >
                    <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: "rgba(255,255,255,0.65)", fontSize: 13 }}
                    />
                    <YAxis
                      tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 11 }}
                      domain={[0, 100]}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <Tooltip
                      content={({ active, payload, label }) => (
                        <AttendanceTooltip
                          active={active}
                          payload={payload as readonly { payload: { total: number; present: number; rate: number } }[]}
                          label={label}
                        />
                      )}
                    />
                    <Bar dataKey="rate" name="معدل الحضور %" radius={[8, 8, 0, 0]}>
                      {attendanceTrend.map((entry, i) => (
                        <Cell
                          key={`att-${i}`}
                          fill={
                            entry.rate >= 80
                              ? "rgba(99,192,176,0.85)"
                              : entry.rate >= 60
                              ? "rgba(251,191,36,0.75)"
                              : entry.total === 0
                              ? "rgba(255,255,255,0.12)"
                              : "rgba(239,68,68,0.75)"
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            <div className="mt-2 text-xs text-white/40">
              يُحسب من سجلات حضور اللاعبين فقط · المعدل = عدد الحضور ÷ إجمالي السجلات
            </div>
          </Card>
        </div>

        {/* Row 4: Day-of-month distribution — full width */}
        <div className="mt-6">
          <Card className="p-6">
            <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="text-sm text-white/60">📅 توزيع التسجيل حسب يوم الشهر</div>
                <div className="mt-1 text-lg font-bold">
                  متى يتسجّل اللاعبون؟ (من اليوم 1 إلى 31)
                </div>
                {peakWindow && (
                  <div className="mt-1 text-xs text-amber-300">
                    ✦ ذروة التسجيل: من اليوم {peakWindow.from} إلى {peakWindow.to}{" "}
                    <span className="text-white/50">
                      ({peakWindow.total} اشتراك في آخر {range} أشهر)
                    </span>
                  </div>
                )}
                {!peakWindow && (
                  <div className="mt-1 text-xs text-white/40">
                    لا توجد بيانات كافية للفترة المختارة
                  </div>
                )}
              </div>
              <div className="text-xs text-white/40 shrink-0">
                فلتر: {branchFilter === "all" ? "كل الفروع" : branches.find((b) => b.id === branchFilter)?.name ?? ""}{" "}
                · آخر {range} أشهر
              </div>
            </div>

            <div className="mt-4 h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={dayOfMonthData}
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                  barSize={14}
                >
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 10 }}
                    interval={1}
                  />
                  <YAxis
                    tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 11 }}
                    allowDecimals={false}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="rounded-xl border border-white/10 bg-[#0B1220]/95 px-4 py-3 text-xs text-white shadow-xl">
                          <div className="font-semibold mb-1">اليوم {String(label)}</div>
                          <div>
                            اشتراكات جديدة:{" "}
                            <span className="font-bold text-purple-300">
                              {String(payload[0]?.value ?? 0)}
                            </span>
                          </div>
                        </div>
                      );
                    }}
                  />
                  {/* Highlight peak window */}
                  {peakWindow && (
                    <>
                      <ReferenceLine
                        x={String(peakWindow.from)}
                        stroke="rgba(251,191,36,0.4)"
                        strokeDasharray="4 2"
                      />
                      <ReferenceLine
                        x={String(peakWindow.to)}
                        stroke="rgba(251,191,36,0.4)"
                        strokeDasharray="4 2"
                      />
                    </>
                  )}
                  <Bar dataKey="count" name="اشتراكات جديدة" radius={[4, 4, 0, 0]}>
                    {dayOfMonthData.map((entry, i) => {
                      const inPeak =
                        peakWindow &&
                        entry.day >= peakWindow.from &&
                        entry.day <= peakWindow.to;
                      return (
                        <Cell
                          key={`d-${i}`}
                          fill={
                            inPeak
                              ? "rgba(251,191,36,0.85)"
                              : entry.count > 0
                              ? "rgba(167,139,250,0.75)"
                              : "rgba(167,139,250,0.2)"
                          }
                        />
                      );
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-3 text-xs text-white/40">
              يُحسب من مدفوعات التسجيل الجديد (kind=new) فقط ·{" "}
              <span className="text-amber-300/70">الأصفر = ذروة التسجيل</span>
            </div>
          </Card>
        </div>

        <div className="mt-8 text-center text-xs text-white/40">
          البيانات مستخرجة من سجلات اللاعبين والمدفوعات والإدارة المالية
        </div>
      </div>
    </main>
  );
}
