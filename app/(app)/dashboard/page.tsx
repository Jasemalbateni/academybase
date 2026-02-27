"use client";

import { useEffect, useMemo, useState } from "react";
import { getUserRole, type UserRole } from "@/src/lib/supabase/roles";
import { resolveAcademyId } from "@/src/lib/supabase/academyId";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { BarChart, Bar } from "recharts";

import { createClient } from "@/src/lib/supabase/browser";
import { listPlayers, type DbPlayer } from "@/src/lib/supabase/players";
import { listPayments, type DbPayment } from "@/src/lib/supabase/payments";
import { listBranches, type DbBranch } from "@/src/lib/supabase/branches";
import { listFinanceTx, type DbFinanceTx } from "@/src/lib/supabase/finance";
import {
  computeInsights,
  type InsightSeverity,
} from "@/src/lib/insights";

// ====== Local types (dashboard view-model) ======

type Player = {
  id: string;
  name: string;
  birth: string;
  phone: string;
  branchId: string;
  subscriptionMode: "حصص" | "شهري";
  sessions: number;
  price: number;
  start: string; // DD/MM/YYYY
  end: string;   // DD/MM/YYYY
};

type Branch = {
  id: string;
  name: string;
  price: number;
  days: string[];
  startTime: string;
  endTime: string;
  subscriptionMode: "حصص" | "شهري";
  createdAt: string;
};


type FinanceTx = {
  id: string;
  month: string;
  dateISO: string;
  type: "مصروف" | "إيراد";
  branchId: string | "all";
  category: string;
  amount: number;
  note?: string;
  source: "auto" | "manual" | "suppressed";
};

type Payment = {
  id: string;
  dateISO: string;
  branchId: string;
  playerId: string;
  amount: number;
  kind: "new" | "renew" | "legacy";
};

// ====== DB → view-model mappers ======

function isoToDDMMYYYY(iso: string): string {
  const parts = (iso || "").split("-");
  if (parts.length !== 3) return "";
  const [yyyy, mm, dd] = parts;
  return `${dd}/${mm}/${yyyy}`;
}

function dbToPlayer(db: DbPlayer): Player {
  return {
    id: db.id,
    name: db.name,
    birth: db.birth,
    phone: db.phone,
    branchId: db.branch_id ?? "",
    subscriptionMode: db.subscription_mode as "حصص" | "شهري",
    sessions: db.sessions,
    price: Number(db.price),
    start: db.start_date ? isoToDDMMYYYY(db.start_date) : "",
    end: db.end_date ? isoToDDMMYYYY(db.end_date) : "",
  };
}

function dbToBranch(db: DbBranch): Branch {
  return {
    id: db.id,
    name: db.name,
    price: Number(db.price),
    days: db.days ?? [],
    startTime: db.start_time ?? "",
    endTime: db.end_time ?? "",
    subscriptionMode: db.subscription_mode as "حصص" | "شهري",
    createdAt: db.created_at,
  };
}


function dbToPayment(db: DbPayment): Payment {
  return {
    id: db.id,
    dateISO: db.date,
    branchId: db.branch_id ?? "",
    playerId: db.player_id,
    amount: Number(db.amount),
    kind: db.kind,
  };
}

function dbToTx(db: DbFinanceTx): FinanceTx {
  return {
    id: db.id,
    month: db.month,
    dateISO: db.date,
    type: db.type as "مصروف" | "إيراد",
    branchId: db.branch_id,
    category: db.category,
    amount: Number(db.amount),
    note: db.note ?? undefined,
    source: db.source as "auto" | "manual" | "suppressed",
  };
}

// ====== Helpers ======

function endOfMonthFromYM(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m, 0);
}


const formatKD = (value: number) =>
  new Intl.NumberFormat("ar-KW", {
    style: "currency",
    currency: "KWD",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);

const formatNum = (value: number) =>
  new Intl.NumberFormat("ar-KW", { maximumFractionDigits: 0 }).format(value ?? 0);

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

// DD/MM/YYYY -> Date
function ddmmyyyyToDate(ddmmyyyy: string) {
  const parts = (ddmmyyyy || "").split("/");
  if (parts.length !== 3) return null;
  const [dd, mm, yyyy] = parts.map(Number);
  if (!dd || !mm || !yyyy) return null;
  const d = new Date(yyyy, mm - 1, dd);
  return Number.isNaN(d.getTime()) ? null : d;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function monthKey(iso: string) {
  return iso.slice(0, 7);
}

function prevMonthKey(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ====== UI Components ======

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

function BigKPI({
  title,
  value,
  sub,
  badge,
  badgeTone = "neutral",
  accent = "mint",
}: {
  title: string;
  value: string;
  sub?: string;
  badge?: string;
  badgeTone?: "up" | "down" | "neutral" | "danger";
  accent?: "mint" | "green" | "red" | "white";
}) {
  const badgeCls =
    badgeTone === "up"
      ? "bg-emerald-400/15 text-emerald-200 border-emerald-300/20"
      : badgeTone === "down"
      ? "bg-rose-500/15 text-rose-200 border-rose-300/20"
      : badgeTone === "danger"
      ? "bg-amber-500/15 text-amber-200 border-amber-300/20"
      : "bg-white/10 text-white/70 border-white/15";

  const accentBar =
    accent === "mint"
      ? "from-emerald-400/40 to-cyan-400/10"
      : accent === "green"
      ? "from-emerald-400/45 to-emerald-400/10"
      : accent === "red"
      ? "from-rose-500/35 to-rose-500/5"
      : "from-white/15 to-white/5";

  return (
    <Card className="relative overflow-hidden p-6">
      <div className={cn("absolute inset-x-0 top-0 h-1 bg-gradient-to-r", accentBar)} />
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-white/60">{title}</div>
          <div className="mt-3 text-4xl font-extrabold tracking-tight text-white">{value}</div>
          {sub && <div className="mt-2 text-xs text-white/45">{sub}</div>}
        </div>
        {badge && (
          <div className={cn("rounded-full border px-3 py-1 text-xs font-semibold", badgeCls)}>
            {badge}
          </div>
        )}
      </div>
    </Card>
  );
}

function TooltipBox({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: readonly { dataKey: string; value: number }[];
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;

  const net = payload.find((p) => p.dataKey === "net")?.value ?? 0;
  const rev = payload.find((p) => p.dataKey === "revenue")?.value ?? 0;
  const exp = payload.find((p) => p.dataKey === "expenses")?.value ?? 0;

  return (
    <div className="rounded-xl border border-white/10 bg-[#0B1220]/95 px-4 py-3 text-xs text-white shadow-xl">
      <div className="mb-2 font-semibold text-white/90">{String(label ?? "")}</div>
      <div className="space-y-1">
        <div className="flex justify-between gap-8">
          <span className="text-white/70">الإيراد</span>
          <span className="font-semibold">{formatKD(rev)}</span>
        </div>
        <div className="flex justify-between gap-8">
          <span className="text-white/70">المصاريف</span>
          <span className="font-semibold">{formatKD(exp)}</span>
        </div>
        <div className="flex justify-between gap-8">
          <span className="text-white/70">الصافي</span>
          <span className="font-semibold">{formatKD(net)}</span>
        </div>
      </div>
    </div>
  );
}

// ====== Page ======

export default function DashboardHome() {
  const supabase = createClient();

  const [academyName, setAcademyName] = useState<string>("");
  const [players, setPlayers] = useState<Player[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [tx, setTx] = useState<FinanceTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<UserRole>("admin_staff");

  const defaultMonth = useMemo(() => monthKey(todayISO()), []);
  const [selectedMonth, setSelectedMonth] = useState<string>(defaultMonth);

  // ── Load all data from Supabase once on mount ────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const loadAll = async () => {
      setLoading(true);
      setPageError(null);

      try {
        // 1. Auth check + role in parallel.
        //    getUserRole() → getMembership() → resolveAcademyId() which warms
        //    the shared academyId Promise-cache used by all lib functions below.
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

        // 2. academyId is now cached from step 1 — this await is a free
        //    Promise resolution (no DB round-trip).
        const academyId = await resolveAcademyId();

        // 3. Academy name + all domain data fire in one parallel batch.
        //    Each listX() calls resolveAcademyId() internally → cache hit.
        const [academyRes, dbPlayers, dbPayments, dbBranches, dbTx] = await Promise.all([
          supabase.from("academies").select("name").eq("id", academyId).single(),
          listPlayers(),
          listPayments(),
          listBranches(),
          listFinanceTx(),
        ]);

        if (cancelled) return;

        setAcademyName(academyRes.data?.name ?? "");
        setPlayers(dbPlayers.map(dbToPlayer));
        setPayments(dbPayments.map(dbToPayment));
        setBranches(dbBranches.map(dbToBranch));
        // Exclude suppressed entries — they have amount=0 and should not affect KPIs
        setTx(dbTx.filter((t) => t.source !== "suppressed").map(dbToTx));
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
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const previousMonth = useMemo(() => prevMonthKey(selectedMonth), [selectedMonth]);

  const branchNameById = useMemo(() => {
    const m = new Map<string, string>();
    branches.forEach((b) => m.set(b.id, b.name));
    return m;
  }, [branches]);

  const monthEnd = useMemo(() => {
    const d = endOfMonthFromYM(selectedMonth);
    d.setHours(23, 59, 59, 999);
    return d;
  }, [selectedMonth]);


  // Active players: started before end-of-month AND (no end date OR end >= end-of-month)
  const activePlayers = useMemo(() => {
    return players.filter((p) => {
      const start = ddmmyyyyToDate(p.start);
      const end = ddmmyyyyToDate(p.end);
      if (!start) return false;
      if (start > monthEnd) return false;
      if (!end) return true;
      return end >= monthEnd;
    });
  }, [players, monthEnd]);

  const expiring7 = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const in7 = new Date(now);
    in7.setDate(in7.getDate() + 7);

    return players.filter((p) => {
      const end = ddmmyyyyToDate(p.end);
      if (!end) return false;
      end.setHours(0, 0, 0, 0);
      return end >= now && end <= in7;
    });
  }, [players]);

  // Finance summaries
  function monthSummary(ym: string) {
    const list = tx.filter((t) => t.month === ym);
    const revenue = list.filter((t) => t.type === "إيراد").reduce((s, t) => s + (t.amount || 0), 0);
    const expenses = list.filter((t) => t.type === "مصروف").reduce((s, t) => s + (t.amount || 0), 0);
    const payroll = list
      .filter((t) => t.type === "مصروف" && t.category === "رواتب")
      .reduce((s, t) => s + (t.amount || 0), 0);
    return { revenue, expenses, profit: revenue - expenses, payroll };
  }

  const cur = useMemo(() => monthSummary(selectedMonth), [tx, selectedMonth]); // eslint-disable-line react-hooks/exhaustive-deps
  const prev = useMemo(() => monthSummary(previousMonth), [tx, previousMonth]); // eslint-disable-line react-hooks/exhaustive-deps

  const profitChangePct = useMemo(() => {
    const base = Math.abs(prev.profit);
    if (base < 1) return 0;
    return Math.round(((cur.profit - prev.profit) / base) * 100);
  }, [cur.profit, prev.profit]);

  const profitBadge = useMemo(() => {
    const sign = profitChangePct > 0 ? "↑" : profitChangePct < 0 ? "↓" : "•";
    return `${sign} ${Math.abs(profitChangePct)}%`;
  }, [profitChangePct]);

  const monthPayments = useMemo(
    () => payments.filter((p) => p.dateISO.slice(0, 7) === selectedMonth),
    [payments, selectedMonth]
  );

  /**
   * Precomputed Map: playerId → YYYY-MM of their earliest payment ever.
   * Built once when payments change — O(payments). Shared by renewalStats and
   * renewalChart so neither needs to .filter().sort() per player per month.
   */
  const firstPaymentMonthByPlayer = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of payments) {
      const existing = m.get(p.playerId);
      if (!existing || p.dateISO < existing) m.set(p.playerId, p.dateISO.slice(0, 7));
    }
    return m;
  }, [payments]);

  /**
   * Renewal rate — player-history-based (correct) logic:
   *
   * For each distinct player who has at least one payment in the selected month:
   *   - "new"   = their FIRST-EVER payment (earliest date across all history)
   *              falls in the selected month
   *   - "renew" = they have a prior payment before the selected month
   *
   * This is more accurate than counting payment rows by the `kind` field because:
   *   1. It deduplicates: a player counted once even if multiple payments exist
   *   2. It's based on actual payment history, not a UI-selected tag
   *   3. It's immune to duplicate payment rows
   */
  const renewalStats = useMemo(() => {
    // Exclude legacy-import payments — imported players are not new subscribers
    const thisMonthPlayerIds = new Set(
      monthPayments.filter((p) => p.kind !== "legacy").map((p) => p.playerId).filter(Boolean)
    );

    let newCount = 0;
    let renewCount = 0;

    for (const pid of thisMonthPlayerIds) {
      // O(1) Map lookup instead of O(N) .filter().sort() per player
      if (firstPaymentMonthByPlayer.get(pid) === selectedMonth) {
        newCount++;   // First-ever payment is this month → new subscriber
      } else {
        renewCount++; // Has prior payment history → renewal
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

  const branchRows = useMemo(() => {
    const map = new Map<string, { revenue: number; expenses: number; profit: number }>();
    branches.forEach((b) => map.set(b.id, { revenue: 0, expenses: 0, profit: 0 }));

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

  const chartData = useMemo(() => {
    const months: string[] = [];
    let curKey = selectedMonth;
    for (let i = 0; i < 6; i++) {
      months.push(curKey);
      curKey = prevMonthKey(curKey);
    }
    months.reverse();

    return months.map((ym) => {
      const s = monthSummary(ym);
      return { month: ym, revenue: s.revenue, expenses: s.expenses, net: s.profit };
    });
  }, [selectedMonth, tx]); // eslint-disable-line react-hooks/exhaustive-deps

  const renewalChart = useMemo(() => {
    return chartData.map(({ month: ym }) => {
      // Exclude legacy-import payments from new/renew classification
      const ymPlayerIds = new Set(
        payments
          .filter((p) => p.dateISO?.slice(0, 7) === ym && p.kind !== "legacy")
          .map((p) => p.playerId)
          .filter(Boolean)
      );

      let renew = 0;
      let news = 0;

      for (const pid of ymPlayerIds) {
        // O(1) Map lookup — no .filter().sort() per player
        if (firstPaymentMonthByPlayer.get(pid) === ym) news++;
        else renew++;
      }

      const total = renew + news;
      const rate = total === 0 ? 0 : Math.round((renew / total) * 100);
      return { month: ym, renewalRate: rate, renew, news };
    });
  }, [payments, chartData, firstPaymentMonthByPlayer]);

  const academyTitle = academyName ? `أكاديمية "${academyName}" الرياضية` : "أكاديمية";

  // Top insights (no attendance data on dashboard — only payment/finance/player-based)
  const topInsights = useMemo(() => {
    return computeInsights({
      players: players.map((p) => ({
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
      payments: payments.map((p) => ({ playerId: p.playerId, dateISO: p.dateISO, kind: p.kind })),
      attendance: [],
      branches:   branches.map((b) => ({ id: b.id, name: b.name })),
      finance:    tx.map((t) => ({
        month:  t.month,
        type:   t.type as "مصروف" | "إيراد",
        amount: t.amount,
        source: t.source,
      })),
      selectedMonth,
      today: todayISO(),
    }).slice(0, 3);
  }, [players, payments, branches, tx, selectedMonth]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <div className="text-white/60 text-sm">جاري تحميل البيانات...</div>
      </main>
    );
  }

  // ── Error / no academy state ───────────────────────────────────────────────
  if (pageError) {
    return (
      <main className="flex-1 flex items-center justify-center p-8">
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-8 text-center max-w-sm">
            <div className="text-red-300 font-semibold mb-2">خطأ في التحميل</div>
            <div className="text-white/60 text-sm">{pageError}</div>
          </div>
        </main>
    );
  }

  return (
    <main className="flex-1 p-8">
          {/* Glow */}
          <div className="pointer-events-none fixed inset-0 -z-10">
            <div className="absolute right-[-200px] top-[-220px] h-[520px] w-[520px] rounded-full bg-emerald-400/10 blur-3xl" />
            <div className="absolute left-[-240px] bottom-[-260px] h-[560px] w-[560px] rounded-full bg-cyan-400/10 blur-3xl" />
          </div>

          <div className="mx-auto max-w-7xl">
            {/* Header */}
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="text-sm text-white/60">لوحة التحكم</div>
                <h1 className="mt-1 text-2xl font-extrabold tracking-tight">{academyTitle}</h1>
                <div className="mt-2 text-sm text-white/50">
                  الأرقام هنا تُقرأ من الإدارة المالية (Auto + Manual) لذلك تعكس الواقع.
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-white/70">
                <span>الشهر:</span>
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="h-9 rounded-xl bg-white/5 border border-white/10 px-3 text-white outline-none focus:border-white/25"
                />
                <button
                  type="button"
                  onClick={() => setSelectedMonth(defaultMonth)}
                  className="h-9 rounded-xl bg-white/10 border border-white/10 px-3 text-white/85 hover:bg-white/15"
                >
                  رجوع لليوم
                </button>
              </div>
            </div>

            {/* KPIs */}
            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              {/* Finance KPIs — owner + admin only */}
              {userRole !== "admin_staff" && (
                <>
                  <BigKPI
                    title="💰 إجمالي دخل الشهر"
                    value={formatKD(cur.revenue)}
                    sub="من بنود الإدارة المالية (يشمل إيرادات الاشتراكات المولدة تلقائياً)"
                    badge={cur.revenue >= prev.revenue ? "↑ جيد" : "↓ أقل"}
                    badgeTone={cur.revenue >= prev.revenue ? "up" : "down"}
                    accent="mint"
                  />
                  <BigKPI
                    title="📉 إجمالي المصاريف"
                    value={formatKD(cur.expenses)}
                    sub="ملاعب + رواتب + مصاريف يدوية"
                    badge={cur.expenses <= prev.expenses ? "↓ ممتاز" : "↑ انتبه"}
                    badgeTone={cur.expenses <= prev.expenses ? "up" : "danger"}
                    accent="white"
                  />
                  <BigKPI
                    title="🟢 صافي الربح"
                    value={formatKD(cur.profit)}
                    sub="المؤشر الأهم لصاحب الأكاديمية"
                    badge={profitBadge}
                    badgeTone={cur.profit >= prev.profit ? "up" : "down"}
                    accent={cur.profit >= 0 ? "green" : "red"}
                  />
                </>
              )}

              <BigKPI
                title="📊 عدد اللاعبين النشطين"
                value={formatNum(activePlayers.length)}
                sub="حسب تاريخ الانتهاء في صفحة اللاعبين"
                badge="↑"
                badgeTone="neutral"
                accent="mint"
              />
              <BigKPI
                title="🔴 اشتراكات تنتهي خلال 7 أيام"
                value={formatNum(expiring7.length)}
                sub="هذه قائمة المتابعة اليومية (Renewal)"
                badge={expiring7.length ? "⚠ مهم" : "✓ ممتاز"}
                badgeTone={expiring7.length ? "danger" : "up"}
                accent="red"
              />
              <BigKPI
                title="📆 معدل التجديد %"
                value={`${renewalRate}%`}
                sub={`تجديد: ${renewCount} | جديد: ${newCount} (لاعبين مميزين هذا الشهر)`}
                badge={renewalRate >= 70 ? "↑ قوي" : renewalRate >= 50 ? "• متوسط" : "↓ ضعيف"}
                badgeTone={renewalRate >= 70 ? "up" : renewalRate >= 50 ? "neutral" : "down"}
                accent="white"
              />

              {/* Payroll + branches — owner + admin only */}
              {userRole !== "admin_staff" && (
                <BigKPI
                  title="👨‍🏫 تكلفة الرواتب (هذا الشهر)"
                  value={formatKD(cur.payroll)}
                  sub="من بنود الرواتب التلقائية في الإدارة المالية"
                  badge="رواتب"
                  badgeTone="neutral"
                  accent="white"
                />
              )}
              <BigKPI
                title="🏟️ عدد الفروع"
                value={formatNum(branches.length)}
                sub="من صفحة الفروع"
                badge="فروع"
                badgeTone="neutral"
                accent="white"
              />
              <BigKPI
                title="⚡ تنبيه سريع"
                value={expiring7.length ? "ابدأ متابعة التجديد" : "الوضع ممتاز"}
                sub="هدفنا: رفع التجديد مع الحفاظ على الربحية"
                badge={expiring7.length ? "ابدأ اليوم" : "استمر"}
                badgeTone={expiring7.length ? "danger" : "up"}
                accent={expiring7.length ? "red" : "green"}
              />
            </div>

            {/* Chart + Branch profit */}
            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-2 p-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm text-white/60">📈 رسم بياني شهري</div>
                    <div className="mt-1 text-lg font-bold">آخر 6 أشهر</div>
                  </div>
                  <div className="text-xs text-white/50">
                    صافي الشهر الحالي:{" "}
                    <span className="font-semibold text-white/80">{formatKD(cur.profit)}</span>
                  </div>
                </div>

                <div className="mt-4 h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                      <XAxis dataKey="month" tick={{ fill: "rgba(255,255,255,0.65)", fontSize: 12 }} />
                      <YAxis tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 12 }} />
                      <Tooltip
                        content={({ active, payload, label }) => (
                          <TooltipBox active={active} payload={payload as { dataKey: string; value: number }[]} label={label} />
                        )}
                      />
                      <Legend
                        formatter={(value) =>
                          value === "revenue" ? "الإيراد"
                          : value === "expenses" ? "المصاريف"
                          : "الصافي"
                        }
                        wrapperStyle={{ fontSize: "12px", color: "rgba(255,255,255,0.65)" }}
                      />
                      <Area type="monotone" dataKey="revenue" stroke="rgba(99,192,176,0.9)" fill="rgba(99,192,176,0.12)" strokeWidth={2} />
                      <Area type="monotone" dataKey="expenses" stroke="rgba(255,255,255,0.45)" fill="rgba(255,255,255,0.06)" strokeWidth={2} />
                      <Area type="monotone" dataKey="net" stroke="rgba(34,197,94,0.9)" fill="rgba(34,197,94,0.10)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              {/* Bar chart: نسبة التجديد آخر 6 شهور */}
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-white/60">📊 نسبة التجديد</div>
                    <div className="mt-1 text-base font-bold text-white">آخر 6 شهور</div>
                  </div>
                  <div className="text-xs text-white/50">Renew % = renew / (renew + new)</div>
                </div>

                <div className="mt-3 h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={renewalChart} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                      <XAxis dataKey="month" tick={{ fill: "rgba(255,255,255,0.65)", fontSize: 12 }} />
                      <YAxis
                        tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 12 }}
                        domain={[0, 100]}
                        tickFormatter={(v) => `${v}%`}
                      />
                      <Tooltip
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null;
                          const row = payload[0]?.payload as { renewalRate: number; renew: number; news: number };
                          return (
                            <div className="rounded-xl border border-white/10 bg-[#0B1220]/95 px-4 py-3 text-xs text-white shadow-xl">
                              <div className="mb-2 font-semibold text-white/90">{String(label)}</div>
                              <div className="space-y-1">
                                <div className="flex justify-between gap-8">
                                  <span className="text-white/70">نسبة التجديد</span>
                                  <span className="font-semibold">{row?.renewalRate ?? 0}%</span>
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
                        }}
                      />
                      <Bar dataKey="renewalRate" radius={[12, 12, 0, 0]} fill="rgba(99,192,176,0.85)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <Card className="p-6">
                <div className="text-sm text-white/60">🏟️ أرباح كل فرع</div>
                <div className="mt-1 text-lg font-bold">هذا الشهر</div>

                <div className="mt-4 space-y-3">
                  {branchRows.length === 0 ? (
                    <div className="text-sm text-white/55">
                      لا توجد حركة مالية لهذا الشهر بعد.
                      <div className="mt-1 text-xs text-white/45">
                        ملاحظة: افتح صفحة الإدارة المالية واختر نفس الشهر؛ سيتم توليد البنود التلقائية.
                      </div>
                    </div>
                  ) : (
                    branchRows.slice(0, 6).map((b) => (
                      <div key={b.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <div className="flex items-center justify-between">
                          <div className="font-semibold text-white/90">{b.name}</div>
                          <div className={cn("text-sm font-bold", b.profit >= 0 ? "text-emerald-200" : "text-rose-200")}>
                            {formatKD(b.profit)}
                          </div>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-white/55">
                          <div>
                            دخل: <span className="text-white/80 font-semibold">{formatKD(b.revenue)}</span>
                          </div>
                          <div>
                            مصاريف: <span className="text-white/80 font-semibold">{formatKD(b.expenses)}</span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}

                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-white/45">
                    * هذه الأرباح مبنية على بنود الشهر في &quot;الإدارة المالية&quot; (Auto + Manual).
                  </div>
                </div>
              </Card>
            </div>

            {/* Top Insights Widget */}
            {topInsights.length > 0 && (
              <div className="mt-6">
                <Card className="p-6">
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <div className="text-sm text-white/60">🎯 التنبيهات الذكية</div>
                      <div className="mt-1 text-lg font-bold">أهم التنبيهات الآن</div>
                    </div>
                    <a
                      href="/insights"
                      className="text-xs text-emerald-400 hover:text-emerald-300 transition"
                    >
                      عرض الكل ←
                    </a>
                  </div>

                  <div className="mt-4 space-y-2.5">
                    {topInsights.map((ins) => {
                      const dotColor: Record<InsightSeverity, string> = {
                        critical: "bg-red-400",
                        warning:  "bg-amber-400",
                        info:     "bg-blue-400",
                      };
                      const badgeStyle: Record<InsightSeverity, string> = {
                        critical: "bg-red-500/15 text-red-200 border-red-400/30",
                        warning:  "bg-amber-500/15 text-amber-200 border-amber-400/30",
                        info:     "bg-blue-500/15 text-blue-200 border-blue-400/30",
                      };
                      const severityLabelMap: Record<InsightSeverity, string> = {
                        critical: "حرج",
                        warning:  "تحذير",
                        info:     "معلومة",
                      };
                      return (
                        <div
                          key={ins.id}
                          className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3"
                        >
                          <div className={cn("mt-1.5 h-2 w-2 rounded-full shrink-0", dotColor[ins.severity])} />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold text-white/90 truncate">
                              {ins.title}
                            </div>
                            <div className="mt-0.5 text-xs text-white/55 line-clamp-1">
                              {ins.description}
                            </div>
                          </div>
                          <span
                            className={cn(
                              "shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold",
                              badgeStyle[ins.severity]
                            )}
                          >
                            {severityLabelMap[ins.severity]}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              </div>
            )}

            {/* Expiring quick list */}
            <div className="mt-6">
              <Card className="p-6">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <div className="text-sm text-white/60">🔴 اشتراكات تنتهي خلال 7 أيام</div>
                    <div className="mt-1 text-lg font-bold">قائمة المتابعة السريعة</div>
                  </div>
                  <div className="text-xs text-white/55">
                    عددهم: <span className="font-semibold text-white/80">{formatNum(expiring7.length)}</span>
                  </div>
                </div>

                <div className="mt-4 overflow-hidden rounded-2xl border border-white/10">
                  <div className="grid grid-cols-12 bg-white/5 px-4 py-3 text-xs text-white/60">
                    <div className="col-span-5">الاسم</div>
                    <div className="col-span-3">الفرع</div>
                    <div className="col-span-4">ينتهي في</div>
                  </div>

                  {expiring7.length === 0 ? (
                    <div className="px-4 py-6 text-sm text-white/55">لا يوجد اشتراكات قريبة من الانتهاء 🎉</div>
                  ) : (
                    <div className="divide-y divide-white/10">
                      {expiring7.slice(0, 10).map((p) => (
                        <div key={p.id} className="grid grid-cols-12 px-4 py-3 text-sm">
                          <div className="col-span-5 font-semibold text-white/85">{p.name}</div>
                          <div className="col-span-3 text-white/70">{branchNameById.get(p.branchId) ?? "—"}</div>
                          <div className="col-span-4 text-white/70">{p.end || "—"}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-3 text-xs text-white/45">
                  * الخطوة القادمة: زر &quot;إرسال رابط تجديد&quot; لكل لاعب (واتساب/SMS).
                </div>
              </Card>
            </div>

            <div className="mt-8 text-center text-xs text-white/40">
              {academyName ? `${academyName} • ` : ""}
              {new Date().toLocaleDateString("ar-KW")}
            </div>
          </div>
        </main>
  );
}
