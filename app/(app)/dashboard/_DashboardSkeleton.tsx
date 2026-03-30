import { Skeleton } from "@/app/components/Skeleton";

/** Full-page skeleton that mirrors the dashboard layout shape. */
export function DashboardSkeleton() {
  return (
    <main className="flex-1 flex flex-col">
      {/* Header bar */}
      <div className="px-4 md:px-8 py-4 border-b border-white/[0.06] flex items-center justify-between gap-4">
        <Skeleton className="h-6 w-48 rounded-lg" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-28 rounded-xl" />
          <Skeleton className="h-8 w-28 rounded-xl" />
        </div>
      </div>

      <div className="flex-1 p-4 md:p-8">
        <div className="mx-auto max-w-[1400px] space-y-5">

          {/* Hero revenue card */}
          <Skeleton className="h-[100px] w-full rounded-2xl" />

          {/* KPI row */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[148px] rounded-2xl" />
            ))}
          </div>

          {/* Main grid */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
            <div className="xl:col-span-2 space-y-5">
              <Skeleton className="h-[360px] rounded-2xl" />
              <Skeleton className="h-[200px] rounded-2xl" />
            </div>
            <div className="space-y-5">
              <Skeleton className="h-[180px] rounded-2xl" />
              <Skeleton className="h-[220px] rounded-2xl" />
              <Skeleton className="h-[160px] rounded-2xl" />
            </div>
          </div>

        </div>
      </div>
    </main>
  );
}
