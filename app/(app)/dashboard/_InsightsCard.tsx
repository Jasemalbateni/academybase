"use client";

import type { InsightSeverity } from "@/src/lib/insights";
import { cn } from "./_utils";
import { Card } from "./_Card";

type Insight = {
  id: string;
  title: string;
  description: string;
  severity: InsightSeverity;
};

type Props = {
  topInsights: Insight[];
};

const DOT_COLOR: Record<InsightSeverity, string> = {
  critical: "bg-red-400",
  warning:  "bg-amber-400",
  info:     "bg-blue-400",
};

const BADGE_STYLE: Record<InsightSeverity, string> = {
  critical: "bg-red-500/15 text-red-200 border-red-400/30",
  warning:  "bg-amber-500/15 text-amber-200 border-amber-400/30",
  info:     "bg-blue-500/15 text-blue-200 border-blue-400/30",
};

const SEVERITY_LABEL: Record<InsightSeverity, string> = {
  critical: "حرج",
  warning:  "تحذير",
  info:     "معلومة",
};

export function InsightsCard({ topInsights }: Props) {
  if (topInsights.length === 0) return null;

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-lg font-bold text-white/65">التنبيهات الذكية</div>
          <div className="mt-1 text-lg font-bold text-white">أهم التنبيهات</div>
        </div>
        <a href="/insights" className="text-xs text-[#00ff9c]/80 hover:text-[#00ff9c] transition">
          عرض الكل ←
        </a>
      </div>
      <div className="mt-4 space-y-2">
        {topInsights.map((ins) => (
          <div key={ins.id} className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-3">
            <div className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", DOT_COLOR[ins.severity])} />
            <div className="min-w-0 flex-1">
              <div className="text-base font-semibold text-white/90 leading-snug">{ins.title}</div>
              <div className="mt-0.5 text-sm text-white/45 line-clamp-2">{ins.description}</div>
            </div>
            <span className={cn(
              "mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold",
              BADGE_STYLE[ins.severity]
            )}>
              {SEVERITY_LABEL[ins.severity]}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
