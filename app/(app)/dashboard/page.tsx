"use client";

import { useDashboardData } from "./_useDashboardData";
import { DashboardHeader }   from "./_DashboardHeader";
import { HeroRevenueCard }   from "./_HeroRevenueCard";
import { DashboardKPIs }     from "./_DashboardKPIs";
import { AreaChartCard }     from "./_AreaChartCard";
import { ExpiringCard }      from "./_ExpiringCard";
import { InsightsCard }      from "./_InsightsCard";
import { AgeChartCard }      from "./_AgeChartCard";
import { BranchProfitCard }  from "./_BranchProfitCard";
import { DashboardSkeleton } from "./_DashboardSkeleton";

export default function DashboardHome() {
  const d = useDashboardData();

  // ── Loading ────────────────────────────────────────────────────────────────
  if (d.loading) return <DashboardSkeleton />;

  if (d.pageError) {
    return (
      <main className="flex-1 flex items-center justify-center p-8">
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-8 text-center max-w-sm">
          <div className="text-red-300 font-semibold mb-2">خطأ في التحميل</div>
          <div className="text-white/60 text-sm">{d.pageError}</div>
        </div>
      </main>
    );
  }

  const academyTitle = d.academyName
    ? `أكاديمية ${d.academyName} الرياضية`
    : "أكاديمية";

  return (
    <main className="flex-1 flex flex-col">
      {/* Background glows */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute right-[-200px] top-[-220px] h-[520px] w-[520px] rounded-full bg-emerald-400/[0.07] blur-3xl" />
        <div className="absolute left-[-240px] bottom-[-260px] h-[560px] w-[560px] rounded-full bg-cyan-400/[0.07] blur-3xl" />
      </div>

      <DashboardHeader
        academyTitle={academyTitle}
        branches={d.branches}
        selectedBranchId={d.selectedBranchId}
        onBranchChange={d.setSelectedBranchId}
        selectedMonth={d.selectedMonth}
        onMonthChange={d.setSelectedMonth}
        defaultMonth={d.defaultMonth}
        onResetMonth={() => d.setSelectedMonth(d.defaultMonth)}
      />

      {/* ── Page Content ── */}
      <div className="flex-1 p-4 md:p-8">
        <div className="mx-auto max-w-[1400px] space-y-5">

          {/* Hero Revenue Card — owner/admin only */}
          {d.userRole !== "admin_staff" && (
            <HeroRevenueCard
              selectedMonth={d.selectedMonth}
              revenue={d.cur.revenue}
              prevRevenue={d.prev.revenue}
              revenueChangePct={d.revenueChangePct}
              sparklineData={d.sparklineData}
            />
          )}

          {/* KPI Grid */}
          <DashboardKPIs
            userRole={d.userRole}
            curProfit={d.cur.profit}
            prevProfit={d.prev.profit}
            profitBadge={d.profitBadge}
            curExpenses={d.cur.expenses}
            prevExpenses={d.prev.expenses}
            renewalRate={d.renewalRate}
            newCount={d.newCount}
            renewCount={d.renewCount}
            activePlayerCount={d.activePlayers.length}
            branchCount={d.branches.length}
          />

          {/* Main 3-column grid */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

            {/* Left: chart + expiring list */}
            <div className="xl:col-span-2 space-y-5">
              <AreaChartCard
                chartData={d.chartData}
                chartRange={d.chartRange}
                onChartRangeChange={d.setChartRange}
                customStart={d.customStart}
                customEnd={d.customEnd}
                onCustomStartChange={d.setCustomStart}
                onCustomEndChange={d.setCustomEnd}
              />
              <ExpiringCard
                expiring7={d.expiring7}
                branchNameById={d.branchNameById}
              />
            </div>

            {/* Right: insights + age pie chart + branch profit */}
            <div className="space-y-5">
              <InsightsCard topInsights={d.topInsights} />
              <AgeChartCard ageDistribution={d.ageDistribution} />
              <BranchProfitCard branchRows={d.branchRows} />
            </div>
          </div>

          {/* Footer */}
          <div className="py-2 text-center text-xs text-white/25">
            {d.academyName ? `${d.academyName} · ` : ""}
            {new Date().toLocaleDateString("ar-KW")}
          </div>

        </div>
      </div>
    </main>
  );
}
