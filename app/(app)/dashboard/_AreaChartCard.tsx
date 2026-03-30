"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

import { cn } from "./_utils";
import type { ChartRange, ChartPoint } from "./_utils";
import { Card, TooltipBox } from "./_Card";

type Props = {
  chartData: ChartPoint[];
  chartRange: ChartRange;
  onChartRangeChange: (r: ChartRange) => void;
  customStart: string;
  customEnd: string;
  onCustomStartChange: (s: string) => void;
  onCustomEndChange: (s: string) => void;
};

export function AreaChartCard({
  chartData,
  chartRange,
  onChartRangeChange,
  customStart,
  customEnd,
  onCustomStartChange,
  onCustomEndChange,
}: Props) {
  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-lg font-bold text-white/65">الإيرادات والمصاريف</div>
          <div className="mt-1 text-xl font-bold text-white">
            {chartRange === "custom"
              ? "نطاق مخصص"
              : `آخر ${chartRange} أشهر`}
          </div>
        </div>

        {/* Range selector */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {([3, 6, 12] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => onChartRangeChange(r)}
              className={cn(
                "h-7 rounded-lg border px-3 text-xs font-medium transition-colors",
                chartRange === r
                  ? "border-[#00ff9c]/40 bg-[#00ff9c]/10 text-[#00ff9c]"
                  : "border-white/10 bg-white/5 text-white/55 hover:bg-white/10 hover:text-white/80"
              )}
            >
              {r}م
            </button>
          ))}
          <button
            type="button"
            onClick={() => onChartRangeChange("custom")}
            className={cn(
              "h-7 rounded-lg border px-3 text-xs font-medium transition-colors",
              chartRange === "custom"
                ? "border-[#00ff9c]/40 bg-[#00ff9c]/10 text-[#00ff9c]"
                : "border-white/10 bg-white/5 text-white/55 hover:bg-white/10 hover:text-white/80"
            )}
          >
            مخصص
          </button>
        </div>
      </div>

      {/* Custom range inputs */}
      {chartRange === "custom" && (
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-white/45">من:</span>
          <input
            type="month"
            value={customStart}
            onChange={(e) => onCustomStartChange(e.target.value)}
            className="h-7 rounded-lg bg-white/5 border border-white/10 px-2.5 text-xs text-white outline-none focus:border-white/25"
          />
          <span className="text-xs text-white/45">إلى:</span>
          <input
            type="month"
            value={customEnd}
            onChange={(e) => onCustomEndChange(e.target.value)}
            className="h-7 rounded-lg bg-white/5 border border-white/10 px-2.5 text-xs text-white outline-none focus:border-white/25"
          />
        </div>
      )}

      <div className="mt-4 h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00ff9c" stopOpacity={0.18} />
                <stop offset="95%" stopColor="#00ff9c" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gExpenses" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00e0ff" stopOpacity={0.12} />
                <stop offset="95%" stopColor="#00e0ff" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
            <XAxis dataKey="month" tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }} />
            <YAxis tick={{ fill: "rgba(255,255,255,0.40)", fontSize: 11 }} />
            <Tooltip
              content={({ active, payload, label }) => (
                <TooltipBox active={active} payload={payload as { dataKey: string; value: number }[]} label={label} />
              )}
            />
            <Area type="monotone" dataKey="revenue"  stroke="#00ff9c" strokeWidth={2} fill="url(#gRevenue)" />
            <Area type="monotone" dataKey="expenses" stroke="#00e0ff" strokeWidth={2} fill="url(#gExpenses)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Inline legend */}
      <div className="mt-3 flex items-center gap-5 text-xs text-white/45">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-[2px] rounded bg-[#00ff9c]" />
          الإيرادات
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-[2px] rounded bg-[#00e0ff]" />
          المصاريف
        </span>
      </div>
    </Card>
  );
}
