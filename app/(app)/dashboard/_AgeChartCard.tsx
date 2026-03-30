"use client";

import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { PIE_COLORS } from "./_utils";
import { Card } from "./_Card";

type AgeEntry = { name: string; value: number };

type Props = {
  ageDistribution: AgeEntry[];
};

export function AgeChartCard({ ageDistribution }: Props) {
  return (
    <Card className="p-5">
      <div className="text-lg font-bold text-white/65">توزيع سنة الميلاد</div>
      <div className="mt-0.5 text-lg font-bold text-white">اللاعبون حسب سنة الميلاد</div>

      {ageDistribution.length === 0 ? (
        <div className="mt-4 py-6 text-center text-xs text-white/40">لا توجد بيانات</div>
      ) : (
        <>
          <div className="mt-4 h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={ageDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={82}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {ageDistribution.map((_, index) => (
                    <Cell
                      key={index}
                      fill={PIE_COLORS[index % PIE_COLORS.length]}
                      opacity={0.88}
                    />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const entry = payload[0];
                    return (
                      <div className="rounded-xl border border-white/10 bg-[#0B1220]/95 px-3 py-2 text-xs text-white shadow-xl">
                        <span className="font-semibold">{entry.name}</span>
                        <span className="mr-2 text-white/65">{entry.value} لاعب</span>
                      </div>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Legend — 2-column grid, scrollable when many years */}
          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 max-h-[120px] overflow-y-auto pr-1">
            {ageDistribution.map((entry, i) => (
              <div key={entry.name} className="flex items-center justify-between text-xs min-w-0">
                <span className="flex items-center gap-1.5 min-w-0">
                  <span
                    className="shrink-0 inline-block h-2 w-2 rounded-full"
                    style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                  />
                  <span className="text-white/65 truncate">{entry.name}</span>
                </span>
                <span className="shrink-0 font-semibold text-white/80 mr-1">{entry.value}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
