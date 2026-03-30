"use client";

import type { UserRole } from "@/src/lib/supabase/roles";
import { cn, formatKD, formatNum } from "./_utils";
import { Card } from "./_Card";

type Props = {
  userRole: UserRole;
  curProfit: number;
  prevProfit: number;
  profitBadge: string;
  curExpenses: number;
  prevExpenses: number;
  renewalRate: number;
  newCount: number;
  renewCount: number;
  activePlayerCount: number;
  branchCount: number;
};

export function DashboardKPIs({
  userRole,
  curProfit,
  prevProfit,
  profitBadge,
  curExpenses,
  prevExpenses,
  renewalRate,
  newCount,
  renewCount,
  activePlayerCount,
  branchCount,
}: Props) {
  return (
    <div className={cn(
      "grid gap-4 grid-cols-1 sm:grid-cols-2",
      userRole !== "admin_staff" ? "lg:grid-cols-5" : "lg:grid-cols-3"
    )}>
      {userRole !== "admin_staff" && (
        <>
          {/* صافي الربح */}
          <Card className="relative overflow-hidden p-5">
            <div className="absolute inset-x-0 top-0 h-[2px] bg-[#00e0ff]" />
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/net-profit.png" alt="" width={22} height={22} style={{ objectFit: "contain", opacity: 0.9 }} className="shrink-0" />
              <div className="text-lg font-bold text-white/65">صافي الربح</div>
            </div>
            <div className={cn(
              "mt-2 text-3xl font-extrabold leading-none",
              curProfit >= 0 ? "text-white" : "text-rose-300"
            )}>
              {formatKD(curProfit)}
            </div>
            <div className={cn(
              "mt-2 inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold",
              curProfit >= prevProfit
                ? "bg-emerald-400/15 text-emerald-200 border-emerald-400/30"
                : "bg-rose-500/15 text-rose-200 border-rose-400/30"
            )}>
              {profitBadge}
            </div>
          </Card>

          {/* المصاريف */}
          <Card className="relative overflow-hidden p-5">
            <div className="absolute inset-x-0 top-0 h-[2px] bg-rose-400" />
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/expenses.png" alt="" width={22} height={22} style={{ objectFit: "contain", opacity: 0.9 }} className="shrink-0" />
              <div className="text-lg font-bold text-white/65">المصاريف</div>
            </div>
            <div className="mt-2 text-3xl font-extrabold leading-none text-white">
              {formatKD(curExpenses)}
            </div>
            <div className={cn(
              "mt-2 inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold",
              curExpenses <= prevExpenses
                ? "bg-emerald-400/15 text-emerald-200 border-emerald-400/30"
                : "bg-amber-500/15 text-amber-200 border-amber-400/30"
            )}>
              {curExpenses <= prevExpenses ? "↓ ممتاز" : "↑ انتبه"}
            </div>
          </Card>
        </>
      )}

      {/* معدل التجديد */}
      <Card className="relative overflow-hidden p-5">
        <div className="absolute inset-x-0 top-0 h-[2px] bg-[#00ff9c]" />
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/renewal-percentage.png" alt="" width={22} height={22} style={{ objectFit: "contain", opacity: 0.9 }} className="shrink-0" />
          <div className="text-lg font-bold text-white/65">معدل التجديد</div>
        </div>
        <div className="mt-2 text-3xl font-extrabold leading-none text-white">{renewalRate}%</div>
        <div className={cn(
          "mt-2 inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold",
          renewalRate >= 70
            ? "bg-emerald-400/15 text-emerald-200 border-emerald-400/30"
            : renewalRate >= 50
            ? "bg-white/10 text-white/70 border-white/15"
            : "bg-rose-500/15 text-rose-200 border-rose-400/30"
        )}>
          {renewalRate >= 70 ? "↑ قوي" : renewalRate >= 50 ? "• متوسط" : "↓ ضعيف"}
        </div>
      </Card>

      {/* لاعبون جدد */}
      <Card className="relative overflow-hidden p-5">
        <div className="absolute inset-x-0 top-0 h-[2px] bg-white/20" />
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/new-players.png" alt="" width={22} height={22} style={{ objectFit: "contain", opacity: 0.9 }} className="shrink-0" />
          <div className="text-lg font-bold text-white/65">لاعبون جدد</div>
        </div>
        <div className="mt-2 text-3xl font-extrabold leading-none text-white">{formatNum(newCount)}</div>
        <div className="mt-2 text-sm text-white/40">مجدد: {renewCount} لاعب</div>
      </Card>

      {/* اللاعبون النشطون */}
      <Card className="relative overflow-hidden p-5">
        <div className="absolute inset-x-0 top-0 h-[2px] bg-[#00e0ff]" />
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/active-players.png" alt="" width={22} height={22} style={{ objectFit: "contain", opacity: 0.9 }} className="shrink-0" />
          <div className="text-lg font-bold text-white/65">اللاعبون النشطون</div>
        </div>
        <div className="mt-2 text-3xl font-extrabold leading-none text-white">
          {formatNum(activePlayerCount)}
        </div>
        <div className="mt-2 text-sm text-white/40">
          {branchCount > 0 ? `${formatNum(branchCount)} فروع` : "إجمالي اللاعبين"}
        </div>
      </Card>
    </div>
  );
}
