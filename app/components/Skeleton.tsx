/**
 * Skeleton — shimmer placeholder for loading states.
 * Usage: <Skeleton className="h-4 w-32 rounded-lg" />
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse bg-white/[0.07] ${className}`}
      aria-hidden="true"
    />
  );
}
