"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { type UserRole, roleLabel } from "@/lib/supabase/roles";

const NavItem = ({
  href,
  label,
  active = false,
}: {
  href: string;
  label: string;
  active?: boolean;
}) => (
  <Link
    href={href}
    className={[
      "block rounded-xl px-4 py-3 text-sm transition",
      active ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5 hover:text-white",
    ].join(" ")}
  >
    {label}
  </Link>
);

export default function Sidebar() {
  const router   = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  const [academyName, setAcademyName]       = useState<string>("");
  const [userName,    setUserName]          = useState<string>("");
  const [userRole, setUserRole]             = useState<UserRole>("admin_staff");
  const [hasFinanceAccess, setFinanceAccess] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      // getSession reads from the cookie — no extra network round-trip.
      // Security is enforced by RLS; Sidebar only needs the user id for display.
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user || cancelled) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("academy_id, full_name")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!profile?.academy_id || cancelled) return;

      if (profile.full_name) setUserName(profile.full_name);

      const [academyRes, memberRes] = await Promise.all([
        supabase
          .from("academies")
          .select("name")
          .eq("id", profile.academy_id)
          .single(),
        supabase
          .from("academy_members")
          .select("role, has_finance_access")
          .eq("user_id", user.id)
          .eq("academy_id", profile.academy_id)
          .maybeSingle(),
      ]);

      if (cancelled) return;

      if (academyRes.data?.name) setAcademyName(academyRes.data.name);

      const role = (memberRes.data?.role as UserRole) ?? "admin_staff";
      setUserRole(role);

      // owner and partner always have finance access
      const financeAccess =
        role === "owner" || role === "partner"
          ? true
          : (memberRes.data?.has_finance_access ?? false);
      setFinanceAccess(financeAccess);
    };

    run();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logoLetter = useMemo(() => {
    const n = (academyName || "").trim();
    return n ? n[0] : "A";
  }, [academyName]);

  const title            = academyName || "AcademyBase";
  const isOwnerOrPartner = userRole === "owner" || userRole === "partner";
  const canSeeStaff      = isOwnerOrPartner || userRole === "branch_manager";
  const canSeeFinance    = isOwnerOrPartner || hasFinanceAccess;

  // Derive active nav item from the current pathname
  const active = pathname.startsWith("/dashboard")           ? "dashboard"
    : pathname.startsWith("/players")                        ? "players"
    : pathname.startsWith("/finance")                        ? "finance"
    : pathname.startsWith("/branches")                       ? "branches"
    : pathname.startsWith("/staff/attendance")               ? "staff_attendance"
    : pathname.startsWith("/staff")                          ? "staff"
    : pathname.startsWith("/settings")                       ? "settings"
    : pathname.startsWith("/insights")                       ? "insights"
    : pathname.startsWith("/statistics")                     ? "statistics"
    : pathname.startsWith("/calendar")                       ? "calendar"
    : null;

  return (
    <aside className="w-[260px] shrink-0 bg-[#111827] text-white h-screen sticky top-0 flex flex-col">
      <div className="p-6 flex-1">
        {/* Logo + Title */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center text-sm font-semibold">
            {logoLetter}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{title}</div>
            <div className="text-xs text-white/60">لوحة الإدارة</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="mt-8 space-y-2">
          <NavItem href="/dashboard"           label="لوحة التحكم"       active={active === "dashboard"} />
          <NavItem href="/players"             label="اللاعبين"           active={active === "players" && !pathname.startsWith("/players/attendance")} />
          <NavItem href="/players/attendance"  label="سجل الحضور"        active={pathname.startsWith("/players/attendance")} />
          <NavItem href="/calendar"            label="التقويم"            active={active === "calendar"} />
          <NavItem href="/insights"            label="التنبيهات الذكية"  active={active === "insights"} />
          <NavItem href="/statistics"          label="الإحصائيات"         active={active === "statistics"} />
          {canSeeFinance && (
            <NavItem href="/finance"           label="الادارة المالية"   active={active === "finance"} />
          )}
          <NavItem href="/branches"            label="الفروع"             active={active === "branches"} />
          {canSeeStaff && (
            <NavItem href="/staff"             label="الطاقم"             active={active === "staff"} />
          )}
          {canSeeStaff && (
            <NavItem href="/staff/attendance"  label="حضور الطاقم"        active={active === "staff_attendance"} />
          )}
          <NavItem href="/settings"            label="الإعدادات"          active={active === "settings"} />
        </nav>
      </div>

      {/* Profile + Logout */}
      <div className="p-6 border-t border-white/10 space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-full bg-white/10 flex items-center justify-center text-xs font-semibold shrink-0">
            {logoLetter}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-white/90 truncate">
              {userName || "..."}
            </div>
            <div className="text-xs text-white/55">
              {roleLabel[userRole]}
            </div>
          </div>
        </div>

        <button
          onClick={async () => {
            await supabase.auth.signOut();
            router.push("/login");
            router.refresh();
          }}
          className="w-full rounded-xl px-4 py-3 text-sm text-red-300 hover:bg-white/5 transition"
        >
          تسجيل خروج
        </button>
      </div>
    </aside>
  );
}
