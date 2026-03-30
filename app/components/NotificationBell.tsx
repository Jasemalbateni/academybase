"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/src/lib/supabase/browser";
import { resolveAcademyId } from "@/src/lib/supabase/academyId";
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type DbNotification,
} from "@/src/lib/supabase/notifications";

// ── Severity styles ───────────────────────────────────────────────────────────

const dotColors: Record<string, string> = {
  critical: "bg-red-400",
  warning:  "bg-amber-400",
  info:     "bg-blue-400",
};

// ── NotificationBell ──────────────────────────────────────────────────────────

export default function NotificationBell() {
  const [open,          setOpen]          = useState(false);
  const [notifications, setNotifications] = useState<DbNotification[]>([]);
  const [loaded,        setLoaded]        = useState(false);
  const [marking,       setMarking]       = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Stable Supabase client — created once for the component lifetime
  const supabase = useRef(createClient()).current;

  // Load once on mount
  useEffect(() => {
    listNotifications()
      .then(setNotifications)
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  // ── Realtime subscription ─────────────────────────────────────────────────
  // Subscribes to INSERT and UPDATE postgres_changes events on the
  // notifications table, filtered by academy_id to prevent cross-tenant leaks.
  // Requires: supabase/31_realtime_notifications.sql run in the database.
  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    resolveAcademyId().then((academyId) => {
      if (cancelled) return;

      channel = supabase
        .channel(`notif-bell:${academyId}`)
        .on(
          "postgres_changes",
          {
            event:  "INSERT",
            schema: "public",
            table:  "notifications",
            filter: `academy_id=eq.${academyId}`,
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (payload: any) => {
            const n = payload.new as DbNotification;
            setNotifications((prev) =>
              // Guard against duplicate delivery
              prev.some((x) => x.id === n.id) ? prev : [n, ...prev]
            );
          }
        )
        .on(
          "postgres_changes",
          {
            event:  "UPDATE",
            schema: "public",
            table:  "notifications",
            filter: `academy_id=eq.${academyId}`,
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (payload: any) => {
            const updated = payload.new as DbNotification;
            setNotifications((prev) =>
              prev.map((n) => (n.id === updated.id ? updated : n))
            );
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

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const unread = notifications.filter((n) => !n.is_read).length;

  async function handleMarkRead(id: string) {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    // Notify sidebar badge to decrement without a DB round-trip
    window.dispatchEvent(new CustomEvent("notifications:decrement"));
    await markNotificationRead(id).catch(() => {});
  }

  async function handleMarkAllRead() {
    setMarking(true);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    // Notify sidebar badge to reset to zero
    window.dispatchEvent(new CustomEvent("notifications:clear"));
    await markAllNotificationsRead().catch(() => {});
    setMarking(false);
  }

  return (
    <div ref={ref} className="relative">
      {/* Bell button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition"
        aria-label="التنبيهات"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {loaded && unread > 0 && (
          <span className="absolute top-1 right-1 h-4 min-w-[16px] rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center px-0.5 leading-none">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-80 rounded-2xl border border-white/15 bg-[#111827] shadow-2xl z-50 overflow-hidden"
          dir="rtl"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white">التنبيهات</span>
              {unread > 0 && (
                <span className="rounded-full bg-red-500/20 border border-red-400/30 px-1.5 py-0.5 text-[10px] font-bold text-red-300">
                  {unread} جديد
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  disabled={marking}
                  className="text-xs text-white/50 hover:text-white/80 transition disabled:opacity-40"
                >
                  تعليم الكل كمقروء
                </button>
              )}
              <Link
                href="/insights"
                onClick={() => setOpen(false)}
                className="text-xs text-[#63C0B0] hover:text-[#00ff9c] transition"
              >
                عرض الكل
              </Link>
            </div>
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto">
            {!loaded ? (
              <div className="py-6 text-center text-xs text-white/40">جاري التحميل...</div>
            ) : notifications.length === 0 ? (
              <div className="py-8 text-center">
                <div className="text-2xl mb-2">✓</div>
                <div className="text-sm text-emerald-400 font-medium">لا توجد تنبيهات</div>
                <div className="text-xs text-white/40 mt-1">الوضع ممتاز!</div>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`flex items-start gap-3 px-4 py-3 transition ${
                      n.is_read ? "opacity-50" : "bg-white/[0.02]"
                    }`}
                  >
                    <div
                      className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${
                        dotColors[n.severity] ?? "bg-white/30"
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-white/90 leading-snug">
                        {n.title}
                      </div>
                      {n.scope_name && (
                        <div className="text-[10px] text-white/40 mt-0.5">{n.scope_name}</div>
                      )}
                    </div>
                    {!n.is_read && (
                      <button
                        type="button"
                        onClick={() => handleMarkRead(n.id)}
                        className="shrink-0 text-[10px] text-white/30 hover:text-white/70 transition mt-0.5"
                        title="تعليم كمقروء"
                      >
                        ✓
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
