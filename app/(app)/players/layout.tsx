"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function PlayersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isAttendance = pathname.startsWith("/players/attendance");

  return (
    <div className="flex flex-col flex-1">
      {/* Sub-navigation — "اللاعبون" section tabs */}
      <div className="flex items-end gap-0 px-4 md:px-6 pt-5 border-b border-white/10">
        <SubNavLink href="/players"            label="اللاعبون"    active={!isAttendance} />
        <SubNavLink href="/players/attendance" label="سجل الحضور" active={isAttendance}  />
      </div>

      {children}
    </div>
  );
}

function SubNavLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={[
        "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition whitespace-nowrap",
        active
          ? "border-emerald-400 text-emerald-300"
          : "border-transparent text-white/50 hover:text-white/80",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}
