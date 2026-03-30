"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { resolveAcademyId } from "@/src/lib/supabase/academyId";
import { type UserRole, roleLabel, getMembership } from "@/lib/supabase/roles";
import { countUnreadNotifications } from "@/src/lib/supabase/notifications";
import { clearLibCaches } from "@/src/lib/supabase/clearAllCaches";

// ── Module-level display cache ─────────────────────────────────────────────────
// Stores sidebar display data for the session so the component doesn't re-query
// on every mount (e.g. HMR, StrictMode double-mount, or unusual navigation).
// Cleared on sign-out together with the other caches.
type SidebarData = {
  academyName: string;
  userName: string;
  role: UserRole;
  hasFinanceAccess: boolean;
  logoUrl: string | null;
};
let _sidebarCache: SidebarData | null = null;

/** Call this after updating academy logo so the sidebar re-fetches on next mount. */
export function clearSidebarCache() {
  _sidebarCache = null;
}

const NavItem = ({
  href,
  label,
  icon,
  active = false,
  badge,
  onClick,
}: {
  href: string;
  label: string;
  icon?: string;
  active?: boolean;
  badge?: number;
  onClick?: () => void;
}) => (
  <Link
    href={href}
    onClick={onClick}
    className={[
      "flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium transition",
      active
        ? "bg-[#00ff9c]/10 text-[#00ff9c] border border-[#00ff9c]/20"
        : "text-white/65 hover:bg-white/[0.05] hover:text-white border border-transparent",
    ].join(" ")}
  >
    {icon && (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={icon} alt="" width={20} height={20} style={{ objectFit: "contain" }} className="shrink-0" />
    )}
    <span className="flex-1">{label}</span>
    {badge != null && badge > 0 && (
      <span className="shrink-0 h-5 min-w-[20px] rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center px-1 leading-none">
        {badge > 9 ? "9+" : badge}
      </span>
    )}
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
  const [logoUrl,     setLogoUrl]            = useState<string | null>(null);
  const [notifCount,  setNotifCount]         = useState(0);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      // Serve from module-level cache when available (avoids all DB calls on
      // re-mounts: HMR, React StrictMode double-invoke, unusual navigation).
      if (_sidebarCache) {
        setAcademyName(_sidebarCache.academyName);
        setUserName(_sidebarCache.userName);
        setUserRole(_sidebarCache.role);
        setFinanceAccess(_sidebarCache.hasFinanceAccess);
        setLogoUrl(_sidebarCache.logoUrl);
        return;
      }

      // getSession reads from the cookie — no extra network round-trip.
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user || cancelled) return;

      // resolveAcademyId() is a shared Promise cache — if any other lib call
      // has already fired the profiles query this session, this returns instantly.
      let academyId: string;
      try {
        academyId = await resolveAcademyId();
      } catch {
        return; // no academy linked yet (invited user mid-setup)
      }
      if (cancelled) return;

      // Three queries in parallel (all unblocked now that we have academyId):
      //   1. profiles — only for full_name (academy_id already resolved above)
      //   2. academies — display name in the header
      //   3. getMembership() — cached; shares result with every other page caller
      const [profileRes, academyRes, membership] = await Promise.all([
        supabase
          .from("profiles")
          .select("full_name")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("academies")
          .select("name, logo_url")
          .eq("id", academyId)
          .single(),
        getMembership(),
      ]);

      if (cancelled) return;

      const data: SidebarData = {
        academyName: academyRes.data?.name ?? "",
        userName:    profileRes.data?.full_name ?? "",
        role:        membership.role,
        hasFinanceAccess: membership.hasFinanceAccess,
        logoUrl:     academyRes.data?.logo_url ?? null,
      };
      _sidebarCache = data;

      setAcademyName(data.academyName);
      setUserName(data.userName);
      setUserRole(data.role);
      setFinanceAccess(data.hasFinanceAccess);
      setLogoUrl(data.logoUrl);

      // Non-blocking: fetch unread notification count for badge
      countUnreadNotifications().then(setNotifCount).catch(() => {});
    };

    run();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Realtime: update badge count when new notifications arrive ────────────
  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    resolveAcademyId().then((academyId) => {
      if (cancelled) return;
      channel = supabase
        .channel(`sidebar-notif:${academyId}`)
        .on(
          "postgres_changes",
          {
            event:  "INSERT",
            schema: "public",
            table:  "notifications",
            filter: `academy_id=eq.${academyId}`,
          },
          () => {
            setNotifCount((c) => c + 1);
          }
        )
        .subscribe();
    }).catch(() => {});

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Listen for mark-as-read events from NotificationBell ─────────────────
  // Uses browser CustomEvents so no additional DB queries are needed.
  useEffect(() => {
    const onDecrement = () => setNotifCount((c) => Math.max(0, c - 1));
    const onClear     = () => setNotifCount(0);
    window.addEventListener("notifications:decrement", onDecrement);
    window.addEventListener("notifications:clear",     onClear);
    return () => {
      window.removeEventListener("notifications:decrement", onDecrement);
      window.removeEventListener("notifications:clear",     onClear);
    };
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
            <Link href="/dashboard" className="shrink-0">
              <Image
                src="/logo-1.png"
                alt="AcademyBase"
                width={120}
                height={32}
                priority
                className="h-8 w-auto"
              />
            </Link>
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
          <NavItem href="/dashboard"          label="لوحة التحكم"      icon="/dashboard.png" active={active === "dashboard"}                                         onClick={onMobileClose} />
          <NavItem href="/players"            label="اللاعبين"          icon="/players.png"   active={active === "players" && !pathname.startsWith("/players/attendance")} onClick={onMobileClose} />
          <NavItem href="/players/attendance" label="سجل الحضور"  icon="/players-attendence.png" active={pathname.startsWith("/players/attendance")}  onClick={onMobileClose} />
          <NavItem href="/calendar"           label="التقويم"    icon="/calender.png"           active={active === "calendar"}                      onClick={onMobileClose} />
          <NavItem href="/insights"           label="التنبيهات"  icon="/notifications.png"      active={active === "insights"}  badge={notifCount}  onClick={onMobileClose} />
          <NavItem href="/statistics"         label="الإحصائيات" icon="/state.png"              active={active === "statistics"}                    onClick={onMobileClose} />
          {canSeeFinance && (
            <NavItem href="/finance"          label="الادارة المالية" icon="/finance.png"       active={active === "finance"}                       onClick={onMobileClose} />
          )}
          <NavItem href="/branches"           label="الفروع"     icon="/branches.png"           active={active === "branches"}                      onClick={onMobileClose} />
          {canSeeStaff && (
            <NavItem href="/staff"            label="الطاقم"     icon="/staff.png"              active={active === "staff"}                         onClick={onMobileClose} />
          )}
          {canSeeStaff && (
            <NavItem href="/staff/attendance" label="حضور الطاقم" icon="/staff-attendence.png" active={active === "staff_attendance"}               onClick={onMobileClose} />
          )}
          <NavItem href="/settings"           label="الإعدادات"         icon="/settings.png"  active={active === "settings"}                                         onClick={onMobileClose} />
        </nav>
      </div>

      {/* Profile + Logout */}
      <div className="p-6 border-t border-white/10 space-y-3">
        <div className="flex items-center gap-3">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt="شعار الأكاديمية"
              className="h-10 w-10 rounded-full object-cover shrink-0 ring-1 ring-white/15"
            />
          ) : (
            <div className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center text-sm font-semibold shrink-0">
              {logoLetter}
            </div>
          )}
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white/90 truncate">
              {userName || "..."}
            </div>
            <div className="text-xs text-white/50">
              {roleLabel[userRole]}
            </div>
          </div>
        </div>

        <button
          onClick={async () => {
            await supabase.auth.signOut();
            clearLibCaches();
            clearSidebarCache();
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
