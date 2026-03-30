"use client";

import { cn, formatKD } from "./_utils";

// ── Card ──────────────────────────────────────────────────────────────────────

export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/[0.06] bg-[#161a30]",
        "shadow-[0_8px_24px_rgba(0,0,0,0.3)]",
        className
      )}
    >
      {children}
    </div>
  );
}

// ── Area-chart tooltip ────────────────────────────────────────────────────────

export function TooltipBox({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: readonly { dataKey: string; value: number }[];
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;

  const rev = payload.find((p) => p.dataKey === "revenue")?.value ?? 0;
  const exp = payload.find((p) => p.dataKey === "expenses")?.value ?? 0;

  return (
    <div className="rounded-xl border border-white/10 bg-[#0B1220]/95 px-4 py-3 text-xs text-white shadow-xl">
      <div className="mb-2 font-semibold text-white/90">{String(label ?? "")}</div>
      <div className="space-y-1">
        <div className="flex justify-between gap-8">
          <span className="text-white/70">الإيراد</span>
          <span className="font-semibold">{formatKD(rev)}</span>
        </div>
        <div className="flex justify-between gap-8">
          <span className="text-white/70">المصاريف</span>
          <span className="font-semibold">{formatKD(exp)}</span>
        </div>
      </div>
    </div>
  );
}
