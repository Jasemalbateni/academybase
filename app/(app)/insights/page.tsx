"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { listPlayers,      type DbPlayer      } from "@/src/lib/supabase/players";
import { listPayments,     type DbPayment      } from "@/src/lib/supabase/payments";
import { listBranches,     type DbBranch       } from "@/src/lib/supabase/branches";
import { listFinanceTx,    type DbFinanceTx    } from "@/src/lib/supabase/finance";
import { listAttendanceByMonth                 } from "@/src/lib/supabase/attendance";
import { upsertNotificationsFromInsights       } from "@/src/lib/supabase/notifications";
import {
  computeInsights,
  type Insight,
  type InsightSeverity,
  type InsightPlayer,
  type InsightPayment,
  type InsightAttendanceRecord,
  type InsightBranch,
  type InsightFinanceTx,
} from "@/src/lib/insights";

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function monthKey(iso: string) {
  return iso.slice(0, 7);
}

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const severityLabel: Record<InsightSeverity, string> = {
  critical: "حرج",
  warning:  "تحذير",
  info:     "معلومة",
};

const severityStyles: Record<InsightSeverity, { card: string; badge: string; dot: string }> = {
  critical: {
    card:  "border-red-500/30 bg-red-500/5",
    badge: "bg-red-500/15 text-red-200 border-red-400/30",
    dot:   "bg-red-400",
  },
  warning: {
    card:  "border-amber-500/30 bg-amber-500/5",
    badge: "bg-amber-500/15 text-amber-200 border-amber-400/30",
    dot:   "bg-amber-400",
  },
  info: {
    card:  "border-blue-500/30 bg-blue-500/5",
    badge: "bg-blue-500/15 text-blue-200 border-blue-400/30",
    dot:   "bg-blue-400",
  },
};

// ── Mappers ───────────────────────────────────────────────────────────────────

function mapPlayer(db: DbPlayer): InsightPlayer {
  return {
    id:       db.id,
    name:     db.name,
    branchId: db.branch_id ?? "",
    end:      db.end_date ?? null,
  };
}

function mapPayment(db: DbPayment): InsightPayment {
  return { playerId: db.player_id, dateISO: db.date, kind: db.kind };
}

function mapBranch(db: DbBranch): InsightBranch {
  return { id: db.id, name: db.name };
}

function mapFinance(db: DbFinanceTx): InsightFinanceTx {
  return {
    month:  db.month,
    type:   db.type as "مصروف" | "إيراد",
    amount: Number(db.amount),
    source: db.source,
  };
}

// ── Filter types ──────────────────────────────────────────────────────────────

type SeverityFilter = "all" | InsightSeverity;
type ScopeFilter    = "all" | "academy" | "branch" | "player";

// ── Action context (threaded from page to card without modifying computeInsights) ──

type ActionContext = {
  // Map of playerId → { phone, branchId }
  playerMap: Map<string, { phone: string; branchId: string | null; end: string | null }>;
  // List of players expiring within 7 days from today
  expiringPlayers: Array<{ id: string; name: string; phone: string; end: string }>;
};

// ── Actionable buttons by insight type ───────────────────────────────────────

function InsightActions({
  insight,
  ctx,
}: {
  insight: Insight;
  ctx: ActionContext;
}) {
  const id = insight.id;

  // ── Expiring subscriptions ─────────────────────────────────────────────────
  if (id.startsWith("expiring-7d-")) {
    return (
      <div className="mt-4 space-y-2">
        <div className="text-xs font-semibold text-white/50 mb-2">⚡ إجراءات سريعة</div>
        {ctx.expiringPlayers.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-2 rounded-xl bg-white/5 border border-white/10 px-3 py-2">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-white/90 truncate">{p.name}</div>
              <div className="text-[10px] text-white/40 mt-0.5">
                ينتهي {p.end.slice(8, 10)}/{p.end.slice(5, 7)}/{p.end.slice(0, 4)}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {p.phone && (
                <a
                  href={`https://wa.me/${p.phone.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 rounded-lg bg-emerald-500/15 border border-emerald-400/25 px-2.5 py-1.5 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-500/25 transition"
                >
                  واتساب
                </a>
              )}
              <Link
                href={`/players?filter=ending7`}
                className="rounded-lg bg-white/8 border border-white/10 px-2.5 py-1.5 text-[10px] text-white/70 hover:bg-white/15 transition"
              >
                عرض الكل
              </Link>
            </div>
          </div>
        ))}
        {ctx.expiringPlayers.length === 0 && (
          <Link
            href="/players?filter=ending7"
            className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-xs text-[#63C0B0] hover:bg-white/10 transition"
          >
            عرض اللاعبين المنتهية اشتراكاتهم قريباً ←
          </Link>
        )}
      </div>
    );
  }

  // ── Consecutive absences (player scope) ──────────────────────────────────
  if (id.startsWith("abs-") && insight.scope.type === "player") {
    const pid    = insight.scope.player_id;
    const player = ctx.playerMap.get(pid);
    const name   = insight.scope.player_name;
    return (
      <div className="mt-4 space-y-2">
        <div className="text-xs font-semibold text-white/50 mb-2">⚡ إجراءات سريعة</div>
        <div className="flex items-center gap-2 flex-wrap">
          {player?.phone && (
            <a
              href={`https://wa.me/${player.phone.replace(/\D/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-xl bg-emerald-500/15 border border-emerald-400/25 px-3 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25 transition"
            >
              <span>واتساب</span>
              <span className="text-emerald-400/70">{name}</span>
            </a>
          )}
          <Link
            href={`/players?search=${encodeURIComponent(name)}`}
            className="flex items-center gap-1.5 rounded-xl bg-white/8 border border-white/10 px-3 py-2 text-xs text-white/70 hover:bg-white/15 transition"
          >
            عرض اللاعب في القائمة
          </Link>
          <Link
            href="/players/attendance"
            className="flex items-center gap-1.5 rounded-xl bg-blue-500/10 border border-blue-400/20 px-3 py-2 text-xs text-blue-300 hover:bg-blue-500/20 transition"
          >
            سجل الحضور
          </Link>
        </div>
      </div>
    );
  }

  // ── Low branch attendance ─────────────────────────────────────────────────
  if (id.startsWith("low-attendance-") && insight.scope.type === "branch") {
    const bid = insight.scope.branch_id;
    return (
      <div className="mt-4 space-y-2">
        <div className="text-xs font-semibold text-white/50 mb-2">⚡ إجراءات سريعة</div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`/players/attendance?branch=${bid}`}
            className="flex items-center gap-1.5 rounded-xl bg-amber-500/15 border border-amber-400/25 px-3 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500/25 transition"
          >
            عرض حضور الفرع
          </Link>
          <Link
            href={`/calendar`}
            className="flex items-center gap-1.5 rounded-xl bg-white/8 border border-white/10 px-3 py-2 text-xs text-white/70 hover:bg-white/15 transition"
          >
            جدول التدريبات
          </Link>
        </div>
      </div>
    );
  }

  // ── Renewal rate drop ─────────────────────────────────────────────────────
  if (id.startsWith("renewal-drop-")) {
    return (
      <div className="mt-4 space-y-2">
        <div className="text-xs font-semibold text-white/50 mb-2">⚡ إجراءات سريعة</div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/players?filter=expired"
            className="flex items-center gap-1.5 rounded-xl bg-red-500/15 border border-red-400/25 px-3 py-2 text-xs font-semibold text-red-300 hover:bg-red-500/25 transition"
          >
            اللاعبون المنتهية اشتراكاتهم
          </Link>
          <Link
            href="/players?filter=ending7"
            className="flex items-center gap-1.5 rounded-xl bg-amber-500/15 border border-amber-400/25 px-3 py-2 text-xs text-amber-300 hover:bg-amber-500/25 transition"
          >
            على وشك الانتهاء
          </Link>
        </div>
      </div>
    );
  }

  // ── Revenue drop ──────────────────────────────────────────────────────────
  if (id.startsWith("revenue-drop-")) {
    return (
      <div className="mt-4 space-y-2">
        <div className="text-xs font-semibold text-white/50 mb-2">⚡ إجراءات سريعة</div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/finance"
            className="flex items-center gap-1.5 rounded-xl bg-[#63C0B0]/15 border border-[#63C0B0]/25 px-3 py-2 text-xs font-semibold text-[#63C0B0] hover:bg-[#63C0B0]/25 transition"
          >
            الإدارة المالية
          </Link>
          <Link
            href="/players?filter=expired"
            className="flex items-center gap-1.5 rounded-xl bg-white/8 border border-white/10 px-3 py-2 text-xs text-white/70 hover:bg-white/15 transition"
          >
            اللاعبون غير المجددين
          </Link>
        </div>
      </div>
    );
  }

  return null;
}

// ── InsightCard ───────────────────────────────────────────────────────────────

function InsightCard({
  insight,
  ctx,
}: {
  insight: Insight;
  ctx: ActionContext;
}) {
  const [expanded, setExpanded] = useState(false);
  const s = severityStyles[insight.severity];

  const scopeLabel =
    insight.scope.type === "academy"
      ? "الأكاديمية"
      : insight.scope.type === "branch"
      ? `فرع: ${insight.scope.branch_name}`
      : insight.scope.type === "player"
      ? `لاعب: ${insight.scope.player_name}`
      : "";

  return (
    <div
      className={cn(
        "rounded-2xl border p-5 transition-all",
        s.card
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className={cn("mt-1.5 h-2.5 w-2.5 rounded-full shrink-0", s.dot)} />
          <div className="min-w-0">
            <div className="font-semibold text-white/90 text-sm leading-snug">
              {insight.title}
            </div>
            <div className="mt-1 text-xs text-white/55">{scopeLabel}</div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-xs font-semibold",
              s.badge
            )}
          >
            {severityLabel[insight.severity]}
          </span>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-white/40 hover:text-white/70 transition text-xs"
          >
            {expanded ? "إخفاء" : "التفاصيل"}
          </button>
        </div>
      </div>

      <p className="mt-3 text-sm text-white/70 leading-relaxed">
        {insight.description}
      </p>

      {/* Action buttons — always visible for actionable insights */}
      <InsightActions insight={insight} ctx={ctx} />

      {expanded && (
        <div className="mt-4 space-y-3">
          <div>
            <div className="text-xs font-semibold text-white/60 mb-2">
              ✅ الإجراءات المقترحة
            </div>
            <ul className="space-y-1.5">
              {insight.actions.map((action, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-white/75">
                  <span className="text-emerald-400 shrink-0 mt-0.5">←</span>
                  {action}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl bg-white/5 border border-white/10 p-3">
            <div className="text-xs font-semibold text-white/60 mb-2">
              📊 لقطة البيانات
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {Object.entries(insight.snapshot).map(([k, v]) => (
                <div key={k} className="text-xs text-white/55">
                  <span className="text-white/40">{k}:</span>{" "}
                  <span className="text-white/80 font-medium">{String(v)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InsightsPage() {
  const defaultMonth = useMemo(() => monthKey(todayISO()), []);
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);

  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  // Raw DB players for action context (phone numbers, etc.)
  const [dbPlayersRaw, setDbPlayersRaw] = useState<DbPlayer[]>([]);

  const [players,    setPlayers]    = useState<InsightPlayer[]>([]);
  const [payments,   setPayments]   = useState<InsightPayment[]>([]);
  const [branches,   setBranches]   = useState<InsightBranch[]>([]);
  const [finance,    setFinance]    = useState<InsightFinanceTx[]>([]);
  const [attendance, setAttendance] = useState<InsightAttendanceRecord[]>([]);

  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [scopeFilter,    setScopeFilter]    = useState<ScopeFilter>("all");

  // Load base data once
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const last6: string[] = [];
        {
          let cur = monthKey(todayISO());
          for (let i = 0; i < 6; i++) {
            last6.push(cur);
            const [y, m] = cur.split("-").map(Number);
            const d = new Date(y, m - 1, 1);
            d.setMonth(d.getMonth() - 1);
            cur = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          }
        }

        const [dbPlayers, dbPayments, dbBranches, dbFinance] = await Promise.all([
          listPlayers(),
          listPayments(),
          listBranches(),
          listFinanceTx(last6),
        ]);
        if (cancelled) return;

        setDbPlayersRaw(dbPlayers);
        setPlayers(dbPlayers.map(mapPlayer));
        setPayments(dbPayments.map(mapPayment));
        setBranches(dbBranches.map(mapBranch));
        setFinance(dbFinance.map(mapFinance));
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

  // Load attendance whenever month changes
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const dbAttendance = await listAttendanceByMonth(selectedMonth);
        if (cancelled) return;
        setAttendance(
          dbAttendance.map((a) => ({
            player_id:    a.player_id,
            session_date: a.date,
            attended:     a.present,
          }))
        );
      } catch {
        // attendance is best-effort — don't block insights
      }
    };
    load();
    return () => { cancelled = true; };
  }, [selectedMonth]);

  const insights = useMemo(() => {
    if (loading) return [];
    return computeInsights({
      players,
      payments,
      attendance,
      branches,
      finance,
      selectedMonth,
      today: todayISO(),
    });
  }, [players, payments, attendance, branches, finance, selectedMonth, loading]);

  // Sync critical+warning insights to notifications DB (once per insight set)
  useEffect(() => {
    if (loading || insights.length === 0) return;
    upsertNotificationsFromInsights(insights).catch(() => {});
  }, [insights, loading]);

  // Action context — computed in parallel with insights, without touching computeInsights
  const actionCtx = useMemo<ActionContext>(() => {
    const playerMap = new Map<string, { phone: string; branchId: string | null; end: string | null }>();
    for (const p of dbPlayersRaw) {
      playerMap.set(p.id, { phone: p.phone, branchId: p.branch_id, end: p.end_date });
    }

    const todayStr = todayISO();
    const todayDate = new Date(todayStr);
    const in7 = new Date(todayStr);
    in7.setDate(in7.getDate() + 7);

    const expiringPlayers = dbPlayersRaw
      .filter((p) => {
        if (!p.end_date || p.is_paused) return false;
        const endDate = new Date(p.end_date);
        return endDate >= todayDate && endDate <= in7;
      })
      .map((p) => ({ id: p.id, name: p.name, phone: p.phone, end: p.end_date! }));

    return { playerMap, expiringPlayers };
  }, [dbPlayersRaw]);

  const filtered = useMemo(() => {
    return insights.filter((ins) => {
      if (severityFilter !== "all" && ins.severity !== severityFilter) return false;
      if (scopeFilter !== "all" && ins.scope.type !== scopeFilter) return false;
      return true;
    });
  }, [insights, severityFilter, scopeFilter]);

  const countBySeverity = useMemo(() => {
    const counts: Record<InsightSeverity, number> = { critical: 0, warning: 0, info: 0 };
    insights.forEach((i) => counts[i.severity]++);
    return counts;
  }, [insights]);

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <div className="text-white/60 text-sm">جاري تحليل البيانات...</div>
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

      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-sm text-white/60">التنبيهات الذكية</div>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight">
              رادار الأداء 🎯
            </h1>
            <div className="mt-1 text-sm text-white/50">
              تنبيهات مُحسوبة تلقائياً من بياناتك — راجعها واتخذ إجراءً
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
              الشهر الحالي
            </button>
          </div>
        </div>

        {/* Summary chips */}
        <div className="mt-6 flex flex-wrap gap-3">
          {(["critical", "warning", "info"] as InsightSeverity[]).map((sev) => {
            const s = severityStyles[sev];
            return (
              <div
                key={sev}
                className={cn(
                  "flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm",
                  s.card
                )}
              >
                <div className={cn("h-2 w-2 rounded-full", s.dot)} />
                <span className="text-white/70">{severityLabel[sev]}</span>
                <span className="font-bold text-white">{countBySeverity[sev]}</span>
              </div>
            );
          })}

          {insights.length === 0 && (
            <div className="flex items-center gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-400/5 px-4 py-2.5 text-sm text-emerald-300">
              ✓ لا توجد تنبيهات — الوضع ممتاز!
            </div>
          )}
        </div>

        {/* Filters */}
        {insights.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {/* Severity filter */}
            <div className="flex items-center gap-1 rounded-xl bg-white/5 border border-white/10 p-1">
              {(["all", "critical", "warning", "info"] as SeverityFilter[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setSeverityFilter(f)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs transition",
                    severityFilter === f
                      ? "bg-white/15 text-white font-semibold"
                      : "text-white/50 hover:text-white/80"
                  )}
                >
                  {f === "all" ? "الكل" : severityLabel[f]}
                </button>
              ))}
            </div>

            {/* Scope filter */}
            <div className="flex items-center gap-1 rounded-xl bg-white/5 border border-white/10 p-1">
              {([
                ["all",     "الكل"],
                ["academy", "الأكاديمية"],
                ["branch",  "الفروع"],
                ["player",  "اللاعبين"],
              ] as [ScopeFilter, string][]).map(([f, label]) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setScopeFilter(f)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs transition",
                    scopeFilter === f
                      ? "bg-white/15 text-white font-semibold"
                      : "text-white/50 hover:text-white/80"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Insight list */}
        <div className="mt-6 space-y-3">
          {filtered.length === 0 && insights.length > 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-sm text-white/55">
              لا توجد تنبيهات تطابق الفلتر المحدد
            </div>
          ) : (
            filtered.map((ins) => (
              <InsightCard key={ins.id} insight={ins} ctx={actionCtx} />
            ))
          )}

          {insights.length === 0 && (
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-12 text-center">
              <div className="text-4xl mb-3">🎉</div>
              <div className="text-emerald-300 font-semibold text-lg">
                لا توجد تنبيهات لهذا الشهر
              </div>
              <div className="mt-2 text-sm text-white/55">
                جميع المؤشرات ضمن النطاق الطبيعي — استمر في العمل الرائع!
              </div>
            </div>
          )}
        </div>

        <div className="mt-8 text-center text-xs text-white/40">
          التنبيهات تُحسب من بياناتك الفعلية (لاعبون، مدفوعات، حضور، مالية)
        </div>
      </div>
    </main>
  );
}
