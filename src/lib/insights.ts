/**
 * AI Insights — computed from existing data, no extra DB table needed.
 * All functions are pure (take data as parameters) and can be called
 * from client or server components after data has been fetched.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type InsightSeverity = "critical" | "warning" | "info";

export type InsightScope =
  | { type: "academy" }
  | { type: "branch"; branch_id: string; branch_name: string }
  | { type: "player"; player_id: string; player_name: string };

export type Insight = {
  id: string;
  title: string;
  description: string;
  severity: InsightSeverity;
  scope: InsightScope;
  actions: string[];
  created_at: string;
  snapshot: Record<string, number | string | boolean | null>;
};

// ── Minimal input slices (mapped from DB types by caller) ────────────────────

export type InsightPlayer = {
  id: string;
  name: string;
  branchId: string;
  end: string | null; // ISO YYYY-MM-DD (end_date)
};

export type InsightPayment = {
  playerId: string;
  dateISO: string; // ISO YYYY-MM-DD
  kind?: string;   // "new" | "renew" | "legacy"
};

export type InsightAttendanceRecord = {
  player_id: string;
  session_date: string; // ISO YYYY-MM-DD
  attended: boolean;
};

export type InsightBranch = {
  id: string;
  name: string;
};

export type InsightFinanceTx = {
  month: string;            // YYYY-MM
  type: "مصروف" | "إيراد";
  amount: number;
  source: string;           // 'auto' | 'manual' | 'suppressed'
};

export type InsightInput = {
  players: InsightPlayer[];
  payments: InsightPayment[];
  attendance: InsightAttendanceRecord[];
  branches: InsightBranch[];
  finance: InsightFinanceTx[];
  selectedMonth: string; // YYYY-MM
  today: string;         // ISO YYYY-MM-DD
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function prevMonthKey(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthRevenue(finance: InsightFinanceTx[], ym: string): number {
  return finance
    .filter((t) => t.month === ym && t.type === "إيراد" && t.source !== "suppressed")
    .reduce((s, t) => s + t.amount, 0);
}

function computeRenewalRate(
  payments: InsightPayment[],
  ym: string
): { rate: number; total: number } {
  // Exclude legacy-import payments — they are not genuine new subscriptions
  const ymPayments = payments.filter(
    (p) => p.dateISO.slice(0, 7) === ym && p.kind !== "legacy"
  );
  const playerIds  = new Set(ymPayments.map((p) => p.playerId).filter(Boolean));
  let renew = 0;
  let newP  = 0;
  for (const pid of playerIds) {
    const all = payments
      .filter((p) => p.playerId === pid)
      .sort((a, b) => a.dateISO.localeCompare(b.dateISO));
    const firstMonth = all[0]?.dateISO?.slice(0, 7);
    if (firstMonth === ym) newP++;
    else renew++;
  }
  const total = renew + newP;
  return { rate: total === 0 ? 0 : Math.round((renew / total) * 100), total };
}

// ── Individual insight generators ─────────────────────────────────────────────

function insightRenewalRateDrop(
  payments: InsightPayment[],
  selectedMonth: string,
  today: string
): Insight | null {
  const cur  = computeRenewalRate(payments, selectedMonth);
  const prev = computeRenewalRate(payments, prevMonthKey(selectedMonth));
  if (cur.total === 0 || prev.total === 0) return null;

  const drop = prev.rate - cur.rate;
  if (drop < 10) return null;

  const severity: InsightSeverity = drop >= 25 ? "critical" : "warning";

  return {
    id:          `renewal-drop-${selectedMonth}`,
    title:       "انخفاض ملحوظ في نسبة التجديد",
    description: `انخفضت نسبة التجديد من ${prev.rate}% الشهر الماضي إلى ${cur.rate}% هذا الشهر (انخفاض ${drop}%). هذا يعني عدد أكبر من اللاعبين لم يجددوا اشتراكاتهم.`,
    severity,
    scope:   { type: "academy" },
    actions: [
      "راجع قائمة اللاعبين غير المجددين وتواصل معهم",
      "تحقق من وجود مشكلة في الخدمة أو التسعير",
      "فعّل حملة تجديد مبكر مع حافز (خصم أو هدية)",
    ],
    created_at: today,
    snapshot: {
      cur_rate:  cur.rate,
      prev_rate: prev.rate,
      drop,
      month: selectedMonth,
    },
  };
}

function insightRevenueDrop(
  finance: InsightFinanceTx[],
  selectedMonth: string,
  today: string
): Insight | null {
  const curRev  = monthRevenue(finance, selectedMonth);
  const prevRev = monthRevenue(finance, prevMonthKey(selectedMonth));
  if (prevRev === 0 || curRev === 0) return null;

  const dropPct = Math.round(((prevRev - curRev) / prevRev) * 100);
  if (dropPct < 15) return null;

  const severity: InsightSeverity = dropPct >= 30 ? "critical" : "warning";

  return {
    id:          `revenue-drop-${selectedMonth}`,
    title:       `انخفاض الإيرادات ${dropPct}% مقارنة بالشهر الماضي`,
    description: `إيرادات هذا الشهر ${curRev.toFixed(0)} د.ك مقابل ${prevRev.toFixed(0)} د.ك الشهر الماضي (انخفاض ${dropPct}%). راجع أسباب الانخفاض قبل نهاية الشهر.`,
    severity,
    scope:   { type: "academy" },
    actions: [
      "راجع قائمة الاشتراكات غير المجددة",
      "تحقق من اكتمال الفواتير التلقائية في الإدارة المالية",
      "حلّل التوزيع حسب الفروع لتحديد المتأثر أكثر",
    ],
    created_at: today,
    snapshot: {
      cur_revenue:  curRev,
      prev_revenue: prevRev,
      drop_pct:     dropPct,
      month:        selectedMonth,
    },
  };
}

function insightUpcomingExpirations(
  players: InsightPlayer[],
  today: string
): Insight | null {
  const todayDate = new Date(today);
  const in7       = new Date(today);
  in7.setDate(in7.getDate() + 7);

  const expiring = players.filter((p) => {
    if (!p.end) return false;
    const endDate = new Date(p.end);
    return endDate >= todayDate && endDate <= in7;
  });

  if (expiring.length === 0) return null;

  const severity: InsightSeverity =
    expiring.length >= 5 ? "critical" : expiring.length >= 2 ? "warning" : "info";

  const names = expiring
    .map((p) => p.name)
    .slice(0, 5)
    .join("، ");
  const extra = expiring.length > 5 ? ` وآخرون (${expiring.length - 5})` : "";

  return {
    id:    `expiring-7d-${today.slice(0, 7)}`,
    title: `${expiring.length} اشتراك${expiring.length > 1 ? "ات" : ""} تنتهي خلال 7 أيام`,
    description: `${names}${extra} — اشتراكاتهم تنتهي قريباً. تواصل معهم الآن لزيادة نسبة التجديد.`,
    severity,
    scope:   { type: "academy" },
    actions: [
      "أرسل رسالة تذكير بالتجديد لكل لاعب",
      "قدّم عرض تجديد مبكر لتشجيعهم",
      `راجع قائمة الـ ${expiring.length} لاعب في صفحة اللاعبين`,
    ],
    created_at: today,
    snapshot: {
      count: expiring.length,
      names: expiring.map((p) => p.name).join(", "),
      today,
    },
  };
}

function insightConsecutiveAbsences(
  players: InsightPlayer[],
  attendance: InsightAttendanceRecord[],
  branches: InsightBranch[],
  selectedMonth: string,
  today: string
): Insight[] {
  const insights: Insight[] = [];
  const branchMap = new Map(branches.map((b) => [b.id, b]));

  for (const player of players) {
    const branch = branchMap.get(player.branchId);
    if (!branch) continue;

    const records = attendance
      .filter(
        (a) =>
          a.player_id === player.id &&
          a.session_date.slice(0, 7) === selectedMonth
      )
      .sort((a, b) => a.session_date.localeCompare(b.session_date));

    if (records.length < 3) continue;

    let maxConsec = 0;
    let curConsec = 0;
    for (const r of records) {
      if (!r.attended) {
        curConsec++;
        maxConsec = Math.max(maxConsec, curConsec);
      } else {
        curConsec = 0;
      }
    }

    if (maxConsec < 3) continue;

    const severity: InsightSeverity = maxConsec >= 5 ? "critical" : "warning";

    insights.push({
      id:          `abs-${player.id}-${selectedMonth}`,
      title:       `${player.name} — ${maxConsec} غيابات متتالية`,
      description: `سجّل اللاعب ${player.name} ${maxConsec} غيابات متتالية هذا الشهر. الغيابات المتكررة قد تشير إلى عدم رضا أو مشكلة شخصية.`,
      severity,
      scope: { type: "player", player_id: player.id, player_name: player.name },
      actions: [
        `تواصل مع ${player.name} للاطمئنان عليه`,
        "تحقق من وجود مشكلة صحية أو شخصية",
        "ذكّره بموعد انتهاء الاشتراك وأهمية الحضور",
      ],
      created_at: today,
      snapshot: {
        consecutive_absences: maxConsec,
        total_records:        records.length,
        branch_name:          branch.name,
        month:                selectedMonth,
      },
    });
  }

  return insights;
}

function insightLowBranchAttendance(
  players: InsightPlayer[],
  attendance: InsightAttendanceRecord[],
  branches: InsightBranch[],
  selectedMonth: string,
  today: string
): Insight[] {
  const insights: Insight[] = [];

  const branchRates: Array<{
    branchId: string;
    rate: number;
    total: number;
  }> = [];

  for (const branch of branches) {
    const branchPlayers = players.filter((p) => p.branchId === branch.id);
    if (branchPlayers.length === 0) continue;

    const playerIds = new Set(branchPlayers.map((p) => p.id));
    const records   = attendance.filter(
      (a) =>
        playerIds.has(a.player_id) &&
        a.session_date.slice(0, 7) === selectedMonth
    );

    if (records.length === 0) continue;

    const attended = records.filter((r) => r.attended).length;
    const rate     = Math.round((attended / records.length) * 100);
    branchRates.push({ branchId: branch.id, rate, total: records.length });
  }

  if (branchRates.length < 2) return insights;

  const avgRate = Math.round(
    branchRates.reduce((s, b) => s + b.rate, 0) / branchRates.length
  );

  for (const br of branchRates) {
    const gap = avgRate - br.rate;
    if (gap < 20) continue;

    const branch    = branches.find((b) => b.id === br.branchId)!;
    const severity: InsightSeverity = gap >= 35 ? "critical" : "warning";

    insights.push({
      id:          `low-attendance-${br.branchId}-${selectedMonth}`,
      title:       `فرع ${branch.name} — حضور أقل من المتوسط`,
      description: `نسبة الحضور في فرع ${branch.name} هذا الشهر ${br.rate}% مقابل متوسط الأكاديمية ${avgRate}% (فارق ${gap}%).`,
      severity,
      scope: { type: "branch", branch_id: br.branchId, branch_name: branch.name },
      actions: [
        `راجع جدول تدريبات فرع ${branch.name}`,
        "تحقق من مشاكل التنقل أو أوقات التدريب",
        "استطلع رأي اللاعبين في الفرع",
      ],
      created_at: today,
      snapshot: {
        branch_rate: br.rate,
        academy_avg: avgRate,
        gap,
        total_records: br.total,
        month:         selectedMonth,
      },
    });
  }

  return insights;
}

// ── Public API ─────────────────────────────────────────────────────────────────

const severityOrder: Record<InsightSeverity, number> = {
  critical: 0,
  warning:  1,
  info:     2,
};

export function computeInsights(input: InsightInput): Insight[] {
  const {
    players, payments, attendance, branches, finance, selectedMonth, today,
  } = input;

  const insights: Insight[] = [];

  const renewalDrop = insightRenewalRateDrop(payments, selectedMonth, today);
  if (renewalDrop) insights.push(renewalDrop);

  const revenueDrop = insightRevenueDrop(finance, selectedMonth, today);
  if (revenueDrop) insights.push(revenueDrop);

  const expiring = insightUpcomingExpirations(players, today);
  if (expiring) insights.push(expiring);

  insights.push(
    ...insightConsecutiveAbsences(players, attendance, branches, selectedMonth, today)
  );
  insights.push(
    ...insightLowBranchAttendance(players, attendance, branches, selectedMonth, today)
  );

  insights.sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
  );

  return insights;
}
