"use client";

import { cn, formatKD } from "./_utils";

type Props = {
  selectedMonth: string;
  revenue: number;
  prevRevenue: number;
  revenueChangePct: number;
  sparklineData: number[];
};

export function HeroRevenueCard({
  selectedMonth,
  revenue,
  prevRevenue,
  revenueChangePct,
  sparklineData,
}: Props) {
  return (
    <div
      className="rounded-3xl border border-white/[0.06] bg-[#161a30] p-6 md:p-8"
      style={{ borderTop: "2px solid #00ff9c", boxShadow: "0 0 40px rgba(0,255,156,0.08)" }}
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">
        <div>
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/revenue.png" alt="" width={32} height={32} style={{ objectFit: "contain", opacity: 0.9 }} className="shrink-0" />
            <div className="text-lg font-bold text-white/65">
              إجمالي الإيرادات · {selectedMonth}
            </div>
          </div>
          <div className="mt-3 text-5xl md:text-6xl font-extrabold tracking-tight text-white leading-none">
            {formatKD(revenue)}
          </div>
          <div className="mt-2 text-base text-white/50">
            {prevRevenue > 0
              ? `الشهر الماضي: ${formatKD(prevRevenue)}`
              : "لا توجد بيانات للشهر الماضي"}
          </div>
        </div>

        <div className="flex flex-col items-start sm:items-end gap-2">
          {/* Trend badge */}
          <div className={cn(
            "rounded-full border px-3 py-1.5 text-sm font-bold",
            revenueChangePct >= 0
              ? "bg-emerald-400/15 text-emerald-300 border-emerald-400/30"
              : "bg-rose-500/15 text-rose-300 border-rose-400/30"
          )}>
            {revenueChangePct >= 0 ? "↑" : "↓"} {Math.abs(revenueChangePct)}%
          </div>
          {/* Comparison label */}
          <div className="text-sm text-white/35">مقارنة بالشهر الماضي</div>

          {/* Sparkline */}
          <div className="flex items-end gap-1 mt-2" style={{ height: "48px" }}>
            {sparklineData.map((val, i) => {
              const maxVal = Math.max(...sparklineData, 1);
              const barH = Math.max(6, Math.round((val / maxVal) * 44));
              const isLast = i === sparklineData.length - 1;
              return (
                <div
                  key={i}
                  className="w-5 rounded-t transition-all"
                  style={{
                    height: `${barH}px`,
                    background: isLast ? "#00ff9c" : "rgba(0,255,156,0.35)",
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
