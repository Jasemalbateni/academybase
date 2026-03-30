/**
 * Type definitions and static constants for the Players page.
 * No business logic — pure TypeScript declarations.
 */

import type { SubscriptionEventType } from "@/src/lib/supabase/subscription-events";

// ── Domain types ───────────────────────────────────────────────────────────────

export type Status = "نشط" | "قريب" | "منتهي" | "تجميد";
export type SubscriptionMode = "حصص" | "شهري";
export type FilterKey = "all" | "active" | "ending7" | "expired";
export type ModalType = "add" | "edit" | "renew" | "extend" | "history";

export type Player = {
  id: string;
  academy_id: string;
  name: string;
  birth: string;
  phone: string;
  branchId: string | null;
  subscriptionMode: SubscriptionMode;
  sessions: number;
  price: number;
  start: string;    // DD/MM/YYYY
  end: string;      // DD/MM/YYYY or "—"
  isLegacy: boolean;
  isPaused: boolean;
  avatarUrl: string | null;
};

export type BranchLite = {
  id: string;
  name: string;
  price: number;
  days: string[];
  subscriptionMode: SubscriptionMode;
};

// ── Static UI constants ────────────────────────────────────────────────────────

export const statusStyles: Record<Status, string> = {
  نشط:   "bg-green-500/15 text-green-400",
  قريب:  "bg-amber-500/15 text-amber-300",
  منتهي: "bg-red-500/15 text-red-400",
  تجميد: "bg-blue-500/15 text-blue-400",
};

export const EVENT_CONFIG: Record<SubscriptionEventType, { label: string; color: string }> = {
  first_registration: { label: "أول تسجيل",       color: "bg-green-500/15 text-green-300 border-green-500/30" },
  renewal:            { label: "تجديد",             color: "bg-teal-500/15 text-teal-300 border-teal-500/30" },
  extension:          { label: "تمديد",             color: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
  paused:             { label: "تجميد الاشتراك",    color: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
  resumed:            { label: "استئناف الاشتراك",  color: "bg-green-500/15 text-green-300 border-green-500/30" },
  expired:            { label: "انتهى الاشتراك",    color: "bg-red-500/15 text-red-300 border-red-500/30" },
  returned:           { label: "تجديد",             color: "bg-teal-500/15 text-teal-300 border-teal-500/30" },
};

export const FILTER_BUTTONS: Array<{ key: FilterKey; label: string }> = [
  { key: "all",      label: "جميع اللاعبين" },
  { key: "active",   label: "النشطون" },
  { key: "ending7",  label: "ينتهي خلال 7 أيام" },
  { key: "expired",  label: "المنتهية اشتراكاتهم" },
];
