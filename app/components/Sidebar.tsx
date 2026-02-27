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
  onClick,
}: {
  href: string;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) => (
  <Link
    href={href}
    onClick={onClick}
    className={[
      "block rounded-xl px-4 py-3 text-sm transition",
      active ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5 hover:text-white",
    ].join(" ")}
  >
    {label}
  </Link>
);

export default function Sidebar({
  mobileOpen = false,
  onMobileClose,
}: {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}) {
  const router   = useRouter();
  const pathname = usePathname();
  // Stable Supabase client — created once, not on every render
  const supabase = useMemo(() => createClient(), []);

  const [academyName, setAcademyName]        = useState<string>("");
  const [userName,    setUserName]           = useState<string>("");
  const [userRole,    setUserRole]           = useState<UserRole>("admin_staff");
  const [hasFinanceAccess, setFinanceAccess] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      // getSession reads from the cookie — no extra network round-trip.
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
    <aside
      className={[
        // Mobile: fixed overlay drawer sliding in from the right (RTL)
        // Desktop (md+): sticky in-flow sidebar
        "fixed md:sticky top-0 right-0",
        "w-[260px] h-screen",
        "z-50 md:z-auto shrink-0",
        "bg-[#111827] text-white flex flex-col",
        "transition-transform duration-300 ease-in-out",
        mobileOpen ? "translate-x-0" : "translate-x-full md:translate-x-0",
      ].join(" ")}
    >
      <div className="p-6 flex-1 overflow-y-auto">
        {/* ── Header row: Logo + Title + Close button (mobile) ─────────────── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center text-sm font-semibold shrink-0">
              {logoLetter}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">{title}</div>
              <div className="text-xs text-white/60">لوحة الإدارة</div>
            </div>
          </div>

          {/* Close button — visible on mobile only */}
          <button
            type="button"
            onClick={onMobileClose}
            className="md:hidden p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition shrink-0"
            aria-label="إغلاق القائمة"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Nav */}
        <nav className="mt-6 space-y-1">
          <NavItem href="/dashboard"          label="لوحة التحكم"      active={active === "dashboard"}                                         onClick={onMobileClose} />
          <NavItem href="/players"            label="اللاعبين"          active={active === "players" && !pathname.startsWith("/players/attendance")} onClick={onMobileClose} />
          <NavItem href="/players/attendance" label="سجل الحضور"       active={pathname.startsWith("/players/attendance")}                     onClick={onMobileClose} />
          <NavItem href="/calendar"           label="التقويم"           active={active === "calendar"}                                         onClick={onMobileClose} />
          <NavItem href="/insights"           label="التنبيهات الذكية" active={active === "insights"}                                         onClick={onMobileClose} />
          <NavItem href="/statistics"         label="الإحصائيات"        active={active === "statistics"}                                       onClick={onMobileClose} />
          {canSeeFinance && (
            <NavItem href="/finance"          label="الادارة المالية"  active={active === "finance"}                                          onClick={onMobileClose} />
          )}
          <NavItem href="/branches"           label="الفروع"            active={active === "branches"}                                         onClick={onMobileClose} />
          {canSeeStaff && (
            <NavItem href="/staff"            label="الطاقم"            active={active === "staff"}                                            onClick={onMobileClose} />
          )}
          {canSeeStaff && (
            <NavItem href="/staff/attendance" label="حضور الطاقم"      active={active === "staff_attendance"}                                 onClick={onMobileClose} />
          )}
          <NavItem href="/settings"           label="الإعدادات"         active={active === "settings"}                                         onClick={onMobileClose} />
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
