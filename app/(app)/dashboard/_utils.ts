/**
 * Pure utilities for the dashboard — no React, no client-side APIs.
 * Types, DB→view-model mappers, pure helpers, and display constants.
 */

import type { DbPlayer } from "@/src/lib/supabase/players";
import type { DbBranch } from "@/src/lib/supabase/branches";
import type { DbPayment } from "@/src/lib/supabase/payments";
import type { DbFinanceTx } from "@/src/lib/supabase/finance";

// ── View-model types ──────────────────────────────────────────────────────────

export type Player = {
  id: string;
  name: string;
  birth: string;
  phone: string;
  branchId: string;
  subscriptionMode: "حصص" | "شهري";
  sessions: number;
  price: number;
  start: string;
  end: string;
  isPaused: boolean;
};

export type Branch = {
  id: string;
  name: string;
  price: number;
  days: string[];
  startTime: string;
  endTime: string;
  subscriptionMode: "حصص" | "شهري";
  createdAt: string;
};

export type FinanceTx = {
  id: string;
  month: string;
  dateISO: string;
  type: "مصروف" | "إيراد";
  branchId: string | "all";
  category: string;
  amount: number;
  note?: string;
  source: "auto" | "manual" | "suppressed";
};

export type Payment = {
  id: string;
  dateISO: string;
  branchId: string;
  playerId: string;
  amount: number;
  kind: "new" | "renew" | "legacy";
};

export type ChartRange = 3 | 6 | 12 | "custom";

export type MonthSummary = {
  revenue: number;
  expenses: number;
  profit: number;
  payroll: number;
};

export type ChartPoint = {
  month: string;
  revenue: number;
  expenses: number;
};

// ── DB → view-model mappers ───────────────────────────────────────────────────

export function isoToDDMMYYYY(iso: string): string {
  const parts = (iso || "").split("-");
  if (parts.length !== 3) return "";
  const [yyyy, mm, dd] = parts;
  return `${dd}/${mm}/${yyyy}`;
}

export function dbToPlayer(db: DbPlayer): Player {
  return {
    id: db.id,
    name: db.name,
    birth: db.birth,
    phone: db.phone,
    branchId: db.branch_id ?? "",
    subscriptionMode: db.subscription_mode as "حصص" | "شهري",
    sessions: db.sessions,
    price: Number(db.price),
    start: db.start_date ? isoToDDMMYYYY(db.start_date) : "",
    end: db.end_date ? isoToDDMMYYYY(db.end_date) : "",
    isPaused: db.is_paused ?? false,
  };
}

export function dbToBranch(db: DbBranch): Branch {
  return {
    id: db.id,
    name: db.name,
    price: Number(db.price),
    days: db.days ?? [],
    startTime: db.start_time ?? "",
    endTime: db.end_time ?? "",
    subscriptionMode: db.subscription_mode as "حصص" | "شهري",
    createdAt: db.created_at,
  };
}

export function dbToPayment(db: DbPayment): Payment {
  return {
    id: db.id,
    dateISO: db.date,
    branchId: db.branch_id ?? "",
    playerId: db.player_id,
    amount: Number(db.amount),
    kind: db.kind,
  };
}

export function dbToTx(db: DbFinanceTx): FinanceTx {
  return {
    id: db.id,
    month: db.month,
    dateISO: db.date,
    type: db.type as "مصروف" | "إيراد",
    branchId: db.branch_id,
    category: db.category,
    amount: Number(db.amount),
    note: db.note ?? undefined,
    source: db.source as "auto" | "manual" | "suppressed",
  };
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

export function endOfMonthFromYM(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m, 0);
}

export const formatKD = (value: number) =>
  new Intl.NumberFormat("ar-KW", {
    style: "currency",
    currency: "KWD",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);

export const formatNum = (value: number) =>
  new Intl.NumberFormat("ar-KW", { maximumFractionDigits: 0 }).format(value ?? 0);

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function ddmmyyyyToDate(ddmmyyyy: string) {
  const parts = (ddmmyyyy || "").split("/");
  if (parts.length !== 3) return null;
  const [dd, mm, yyyy] = parts.map(Number);
  if (!dd || !mm || !yyyy) return null;
  const d = new Date(yyyy, mm - 1, dd);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function monthKey(iso: string) {
  return iso.slice(0, 7);
}

export function prevMonthKey(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthsBetween(start: string, end: string): string[] {
  const months: string[] = [];
  let cur = start;
  while (cur <= end && months.length < 24) {
    months.push(cur);
    const [y, m] = cur.split("-").map(Number);
    const d = new Date(y, m, 1);
    cur = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  return months;
}

export function buildMonthSummary(txList: FinanceTx[], ym: string): MonthSummary {
  const list = txList.filter((t) => t.month === ym);
  const revenue  = list.filter((t) => t.type === "إيراد").reduce((s, t) => s + (t.amount || 0), 0);
  const expenses = list.filter((t) => t.type === "مصروف").reduce((s, t) => s + (t.amount || 0), 0);
  const payroll  = list
    .filter((t) => t.type === "مصروف" && t.category === "رواتب")
    .reduce((s, t) => s + (t.amount || 0), 0);
  return { revenue, expenses, profit: revenue - expenses, payroll };
}

export const PIE_COLORS = [
  "#00ff9c", "#00e0ff", "#a78bfa", "#f59e0b",
  "#f87171", "#60a5fa", "#34d399", "#fb923c",
  "#e879f9", "#38bdf8", "#facc15", "#4ade80",
];
