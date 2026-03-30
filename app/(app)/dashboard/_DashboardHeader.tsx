"use client";

import type { Branch } from "./_utils";

type Props = {
  academyTitle: string;
  branches: Branch[];
  selectedBranchId: string;
  onBranchChange: (id: string) => void;
  selectedMonth: string;
  onMonthChange: (m: string) => void;
  defaultMonth: string;
  onResetMonth: () => void;
};

export function DashboardHeader({
  academyTitle,
  branches,
  selectedBranchId,
  onBranchChange,
  selectedMonth,
  onMonthChange,
  defaultMonth,
  onResetMonth,
}: Props) {
  return (
    <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-[#0b1220]/80 backdrop-blur-md">
      <div className="mx-auto max-w-[1400px] flex items-center justify-between gap-4 px-4 md:px-8 py-4">
        {/* Academy name — primary title, no quotes, no date, no label */}
        <h1 className="text-xl font-bold text-white leading-tight truncate">
          {academyTitle}
        </h1>

        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          {/* Branch selector with chevron */}
          <div className="relative">
            <select
              value={selectedBranchId}
              onChange={(e) => onBranchChange(e.target.value)}
              className="h-8 rounded-xl bg-white/5 border border-white/10 pr-3 pl-7 text-sm text-white outline-none focus:border-white/25 appearance-none cursor-pointer"
            >
              <option value="all" className="bg-[#0b1220]">كل الفروع</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id} className="bg-[#0b1220]">
                  {b.name}
                </option>
              ))}
            </select>
            <svg
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-white/40"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>

          {/* Month selector */}
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => onMonthChange(e.target.value)}
            className="h-8 rounded-xl bg-white/5 border border-white/10 px-3 text-sm text-white outline-none focus:border-white/25 cursor-pointer"
          />
          <button
            type="button"
            onClick={onResetMonth}
            className="h-8 rounded-xl bg-white/[0.06] border border-white/10 px-3 text-xs text-white/60 hover:bg-white/10 hover:text-white/80 transition-colors"
          >
            الشهر الحالي
          </button>
        </div>
      </div>
    </header>
  );
}
