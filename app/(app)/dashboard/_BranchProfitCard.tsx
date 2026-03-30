"use client";

import { cn, formatKD } from "./_utils";
import type { BranchRow } from "./_useDashboardData";
import { Card } from "./_Card";

type Props = {
  branchRows: BranchRow[];
};

export function BranchProfitCard({ branchRows }: Props) {
  return (
    <Card className="p-5">
      <div className="text-lg font-bold text-white/65">أرباح الفروع</div>
      <div className="mt-1 text-lg font-bold text-white">هذا الشهر</div>
      <div className="mt-4 space-y-2">
        {branchRows.length === 0 ? (
          <div className="text-xs text-white/40 py-2">
            لا توجد حركة مالية لهذا الشهر.
            <div className="mt-1 text-white/30">افتح الإدارة المالية لتوليد البنود التلقائية.</div>
          </div>
        ) : (
          branchRows.slice(0, 5).map((b) => (
            <div key={b.id} className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium text-white/90 text-base truncate">{b.name}</div>
                <div className={cn("shrink-0 text-base font-bold", b.profit >= 0 ? "text-emerald-300" : "text-rose-300")}>
                  {formatKD(b.profit)}
                </div>
              </div>
              <div className="mt-1.5 flex gap-3 text-sm text-white/40">
                <span>دخل: <span className="text-white/60">{formatKD(b.revenue)}</span></span>
                <span>مصاريف: <span className="text-white/60">{formatKD(b.expenses)}</span></span>
              </div>
            </div>
          ))
        )}
      </div>
      {branchRows.length > 0 && (
        <div className="mt-3 text-center text-xs text-white/25">
          مبني على بنود الإدارة المالية للشهر المحدد
        </div>
      )}
    </Card>
  );
}
