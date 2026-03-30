"use client";

import Link from "next/link";
import { cn } from "./_utils";
import type { Player } from "./_utils";
import { Card } from "./_Card";

type Props = {
  expiring7: Player[];
  branchNameById: Map<string, string>;
};

export function ExpiringCard({ expiring7, branchNameById }: Props) {
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-lg font-bold text-white/65">اشتراكات قريبة من الانتهاء</div>
          <div className="mt-1 text-lg font-bold text-white">خلال 7 أيام</div>
        </div>
        <div className={cn(
          "rounded-full border px-2.5 py-1 text-xs font-semibold",
          expiring7.length > 0
            ? "bg-amber-500/15 text-amber-200 border-amber-400/30"
            : "bg-emerald-400/15 text-emerald-200 border-emerald-400/30"
        )}>
          {expiring7.length > 0 ? `${expiring7.length} لاعب` : "✓ لا يوجد"}
        </div>
      </div>

      {expiring7.length === 0 ? (
        <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-6 text-center text-sm text-white/40">
          لا يوجد اشتراكات قريبة من الانتهاء
        </div>
      ) : (
        <>
          <div className="mt-4 overflow-hidden rounded-xl border border-white/[0.06]">
            <div className="grid grid-cols-12 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-white/45">
              <div className="col-span-5">الاسم</div>
              <div className="col-span-4">الفرع</div>
              <div className="col-span-2">ينتهي في</div>
              <div className="col-span-1"></div>
            </div>
            <div className="divide-y divide-white/[0.05]">
              {expiring7.slice(0, 8).map((p) => (
                <div key={p.id} className="grid grid-cols-12 px-4 py-3 text-sm hover:bg-white/[0.02] transition-colors items-center">
                  <div className="col-span-5 font-medium text-white/90">{p.name}</div>
                  <div className="col-span-4 text-white/50">{branchNameById.get(p.branchId) ?? "—"}</div>
                  <div className="col-span-2 text-white/50">{p.end || "—"}</div>
                  <div className="col-span-1 flex justify-end">
                    <Link
                      href={`/players?search=${encodeURIComponent(p.name)}&filter=ending7`}
                      className="text-xs text-[#63C0B0] hover:text-white transition"
                      title="عرض في قائمة اللاعبين"
                    >
                      ←
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-3 text-right">
            <Link
              href="/players?filter=ending7"
              className="text-xs text-white/40 hover:text-[#63C0B0] transition"
            >
              عرض الكل ←
            </Link>
          </div>
        </>
      )}
    </Card>
  );
}
