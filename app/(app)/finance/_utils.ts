/**
 * Pure utility functions for the Finance page.
 * No React state, no side effects — safe to unit-test in isolation.
 */

import type { DbFinanceTx } from "@/src/lib/supabase/finance";
import type { DbStaff } from "@/src/lib/supabase/staff";
import type { DbPayment } from "@/src/lib/supabase/payments";
import { ARABIC_MONTHS } from "@/src/lib/utils";
import type { FinanceTx, BranchLite, StaffLite, Payment, GroupedTxView, PrintMode } from "./_types";

// ── Scalar helpers ─────────────────────────────────────────────────────────────

export function todayISO() { return new Date().toISOString().slice(0, 10); }
export function monthKey(iso: string) { return iso.slice(0, 7); }
export function money(n: number) {
  const v = Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
  return `${v} د.ك`;
}
export function pct(n: number) {
  if (!Number.isFinite(n)) return "0%";
  return `${Math.round(n * 10) / 10}%`;
}
export function prevMonthKey(yyyyMM: string) {
  const [y, m] = yyyyMM.split("-").map(Number);
  return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
}

// ── DB → local mappers ─────────────────────────────────────────────────────────

export function dbToTx(db: DbFinanceTx): FinanceTx {
  return {
    id: db.id,
    month: db.month,
    dateISO: db.date,
    type: db.type as FinanceTx["type"],
    branchId: db.branch_id,
    category: db.category as FinanceTx["category"],
    amount: Number(db.amount),
    note: db.note ?? undefined,
    source: db.source as FinanceTx["source"],
    autoKey: db.auto_key ?? undefined,
    overriddenAutoKey: db.overridden_auto_key ?? undefined,
    createdAtISO: db.created_at,
    updatedAtISO: db.updated_at ?? undefined,
  };
}

export function dbToStaffLite(db: DbStaff): StaffLite {
  return {
    id: db.id,
    name: db.name,
    role: db.role,
    jobTitle: db.job_title ?? undefined,
    monthlySalary: Number(db.monthly_salary),
    branchIds: db.branch_ids ?? [],
    isActive: db.is_active,
  };
}

export function dbToPayment(db: DbPayment): Payment {
  return {
    id: db.id,
    dateISO: db.date,
    branchId: db.branch_id,
    playerId: db.player_id,
    amount: Number(db.amount),
    kind: db.kind,
  };
}

// ── Branch name helper ─────────────────────────────────────────────────────────

export function branchNameFromList(branches: BranchLite[], id: string): string {
  if (id === "all") return "عام (الأكاديمية)";
  return branches.find((b) => b.id === id)?.name ?? "—";
}

// ── Export CSV ─────────────────────────────────────────────────────────────────

export function exportCSV(
  visibleTx: FinanceTx[],
  selectedMonth: string,
  selectedBranch: string,
  branches: BranchLite[]
) {
  const rows = visibleTx.map((t) => ({
    التاريخ: t.dateISO,
    الشهر: t.month,
    النوع: t.type,
    التصنيف: t.category,
    الفرع: branchNameFromList(branches, t.branchId),
    المبلغ: t.amount,
    المصدر: t.source === "auto" ? "تلقائي" : "يدوي",
    الملاحظات: t.note ?? "",
  }));
  const headers = Object.keys(rows[0] || { التاريخ: "" });
  const csv =
    headers.join(",") +
    "\n" +
    rows
      .map((r) =>
        headers
          .map((h) => `"${String((r as Record<string, unknown>)[h] ?? "").replaceAll('"', '""')}"`)
          .join(",")
      )
      .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `finance_${selectedMonth}_${selectedBranch}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Print Finance ──────────────────────────────────────────────────────────────

export function printFinanceReport(
  groupedTxViews: GroupedTxView[],
  mode: PrintMode,
  selectedMonth: string,
  selectedBranch: string,
  branches: BranchLite[],
  onClose: () => void
) {
  const views = groupedTxViews.filter((v) => {
    if (mode === "revenues") return v.tx.type === "إيراد";
    if (mode === "expenses") return v.tx.type === "مصروف";
    return true;
  });

  const branchLabel = selectedBranch === "all"
    ? "جميع الفروع"
    : (branches.find((b) => b.id === selectedBranch)?.name ?? selectedBranch);
  const [y, m] = selectedMonth.split("-");
  const monthLabel = `${ARABIC_MONTHS[Number(m) - 1] ?? m} ${y}`;

  const totalRevenue = views.filter((v) => v.tx.type === "إيراد").reduce((s, v) => s + v.tx.amount, 0);
  const totalExpense = views.filter((v) => v.tx.type === "مصروف").reduce((s, v) => s + v.tx.amount, 0);
  const net = totalRevenue - totalExpense;

  const rowsHtml = views.map((v) => {
    const mainRow = `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-weight:600;">${v.tx.note || v.tx.category}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;">${v.tx.type}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;">${v.tx.category}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;">${branchNameFromList(branches, v.tx.branchId)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:left;">${v.tx.dateISO}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:left;font-weight:600;color:${v.tx.type === "إيراد" ? "#16a34a" : "#dc2626"};">${v.tx.amount.toLocaleString("ar-KW")} د.ك</td>
      </tr>`;

    const subRows = (mode === "with_sub" || mode === "all") && v.subItems.length > 0
      ? v.subItems.map((s) => `
        <tr style="background:#f9fafb;">
          <td style="padding:4px 10px 4px 24px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#6b7280;" colspan="3">↳ ${s.label}</td>
          <td style="padding:4px 10px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#6b7280;">${s.date ?? ""}</td>
          <td></td>
          <td style="padding:4px 10px;border-bottom:1px solid #f3f4f6;font-size:12px;text-align:left;color:${s.amount < 0 ? "#dc2626" : "#16a34a"};">${s.amount > 0 ? "+" : ""}${s.amount.toLocaleString("ar-KW")} د.ك</td>
        </tr>`).join("")
      : "";

    return mainRow + subRows;
  }).join("");

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8"/>
  <title>الإدارة المالية — ${monthLabel}</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #111; margin: 0; padding: 24px; direction: rtl; }
    h1 { font-size: 20px; margin-bottom: 4px; }
    .subtitle { font-size: 13px; color: #555; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    thead tr { background: #1e293b; color: #fff; }
    thead th { padding: 8px 10px; text-align: right; }
    thead th:last-child { text-align: left; }
    tbody tr:hover { background: #f8fafc; }
    .summary { margin-top: 20px; display: flex; gap: 32px; font-size: 14px; }
    .summary span { font-weight: 600; }
    .green { color: #16a34a; } .red { color: #dc2626; } .blue { color: #1d4ed8; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <h1>الإدارة المالية</h1>
  <div class="subtitle">${monthLabel} · ${branchLabel}</div>
  <table>
    <thead>
      <tr>
        <th>البند</th><th>النوع</th><th>التصنيف</th><th>الفرع</th><th style="text-align:left;">التاريخ</th><th style="text-align:left;">المبلغ</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div class="summary">
    <div>إجمالي الإيرادات: <span class="green">${totalRevenue.toLocaleString("ar-KW")} د.ك</span></div>
    <div>إجمالي المصروفات: <span class="red">${totalExpense.toLocaleString("ar-KW")} د.ك</span></div>
    <div>صافي الربح: <span class="${net >= 0 ? "green" : "red"}">${net.toLocaleString("ar-KW")} د.ك</span></div>
  </div>
</body>
</html>`;

  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); }, 300);
  onClose();
}
