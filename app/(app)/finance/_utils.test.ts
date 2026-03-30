/**
 * Unit tests for finance page pure utilities.
 * No React, no Supabase, no side effects — fast and isolated.
 */

import { describe, it, expect } from "vitest";
import {
  todayISO,
  monthKey,
  money,
  pct,
  prevMonthKey,
  dbToTx,
  dbToStaffLite,
  dbToPayment,
  branchNameFromList,
} from "./_utils";
import type { BranchLite } from "./_types";

// ── todayISO ───────────────────────────────────────────────────────────────────

describe("todayISO", () => {
  it("returns an ISO date string YYYY-MM-DD", () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ── monthKey ───────────────────────────────────────────────────────────────────

describe("monthKey", () => {
  it("extracts YYYY-MM from ISO string", () => {
    expect(monthKey("2025-03-15")).toBe("2025-03");
  });
  it("handles first day of month", () => {
    expect(monthKey("2025-01-01")).toBe("2025-01");
  });
});

// ── money ──────────────────────────────────────────────────────────────────────

describe("money", () => {
  it("formats whole number", () => {
    expect(money(100)).toBe("100 د.ك");
  });
  it("formats decimal", () => {
    expect(money(99.5)).toBe("99.5 د.ك");
  });
  it("rounds to 2 decimal places", () => {
    expect(money(1.005)).toBe("1.01 د.ك");
  });
  it("handles zero", () => {
    expect(money(0)).toBe("0 د.ك");
  });
  it("handles NaN-like input gracefully", () => {
    // @ts-expect-error testing bad input
    expect(money(undefined)).toBe("0 د.ك");
  });
});

// ── pct ───────────────────────────────────────────────────────────────────────

describe("pct", () => {
  it("formats percentage", () => {
    expect(pct(75)).toBe("75%");
  });
  it("rounds to 1 decimal", () => {
    expect(pct(33.333)).toBe("33.3%");
  });
  it("returns 0% for non-finite", () => {
    expect(pct(NaN)).toBe("0%");
    expect(pct(Infinity)).toBe("0%");
  });
});

// ── prevMonthKey ───────────────────────────────────────────────────────────────

describe("prevMonthKey", () => {
  it("returns previous month", () => {
    expect(prevMonthKey("2025-03")).toBe("2025-02");
  });
  it("wraps back to December of previous year", () => {
    expect(prevMonthKey("2025-01")).toBe("2024-12");
  });
});

// ── branchNameFromList ─────────────────────────────────────────────────────────

describe("branchNameFromList", () => {
  const branches: BranchLite[] = [
    { id: "b1", name: "فرع الجابرية", rent_type: "fixed_monthly", monthly_rent: 200, days: [] },
    { id: "b2", name: "فرع السالمية", rent_type: "per_session", monthly_rent: 50, days: [] },
  ];

  it("returns branch name by id", () => {
    expect(branchNameFromList(branches, "b1")).toBe("فرع الجابرية");
  });

  it("returns عام for 'all'", () => {
    expect(branchNameFromList(branches, "all")).toBe("عام (الأكاديمية)");
  });

  it("returns — for unknown id", () => {
    expect(branchNameFromList(branches, "unknown")).toBe("—");
  });
});

// ── dbToTx ─────────────────────────────────────────────────────────────────────

describe("dbToTx", () => {
  it("maps DB record to FinanceTx", () => {
    const db = {
      id: "tx1",
      month: "2025-03",
      date: "2025-03-15",
      type: "مصروف",
      branch_id: "b1",
      category: "رواتب",
      amount: "500.00",
      note: "راتب المدرب",
      source: "auto",
      auto_key: "salary:2025-03:s1:b1",
      overridden_auto_key: null,
      created_at: "2025-03-01T00:00:00Z",
      updated_at: null,
    } as Parameters<typeof dbToTx>[0];

    const tx = dbToTx(db);
    expect(tx.id).toBe("tx1");
    expect(tx.amount).toBe(500);
    expect(tx.autoKey).toBe("salary:2025-03:s1:b1");
    expect(tx.overriddenAutoKey).toBeUndefined();
    expect(tx.updatedAtISO).toBeUndefined();
  });

  it("maps overridden_auto_key correctly", () => {
    const db = {
      id: "tx2", month: "2025-03", date: "2025-03-15",
      type: "إيراد", branch_id: "b1", category: "اشتراكات",
      amount: "300", note: null, source: "manual",
      auto_key: null, overridden_auto_key: "rev:2025-03:b1",
      created_at: "2025-03-01T00:00:00Z", updated_at: "2025-03-02T00:00:00Z",
    } as Parameters<typeof dbToTx>[0];

    const tx = dbToTx(db);
    expect(tx.overriddenAutoKey).toBe("rev:2025-03:b1");
    expect(tx.autoKey).toBeUndefined();
    expect(tx.updatedAtISO).toBe("2025-03-02T00:00:00Z");
  });
});

// ── dbToStaffLite ──────────────────────────────────────────────────────────────

describe("dbToStaffLite", () => {
  it("maps DB staff record", () => {
    const db = {
      id: "s1", name: "علي أحمد", role: "مدرب",
      job_title: null, monthly_salary: "800.00",
      branch_ids: ["b1", "b2"], is_active: true,
    } as Parameters<typeof dbToStaffLite>[0];

    const staff = dbToStaffLite(db);
    expect(staff.monthlySalary).toBe(800);
    expect(staff.branchIds).toEqual(["b1", "b2"]);
    expect(staff.jobTitle).toBeUndefined();
    expect(staff.isActive).toBe(true);
  });

  it("defaults branch_ids to [] when null", () => {
    const db = {
      id: "s2", name: "فاطمة", role: "موظف",
      job_title: "محاسبة", monthly_salary: "600",
      branch_ids: null, is_active: false,
    } as Parameters<typeof dbToStaffLite>[0];

    expect(dbToStaffLite(db).branchIds).toEqual([]);
  });
});

// ── dbToPayment ────────────────────────────────────────────────────────────────

describe("dbToPayment", () => {
  it("maps DB payment record", () => {
    const db = {
      id: "pay1", date: "2025-03-10",
      branch_id: "b1", player_id: "p1",
      amount: "150.00", kind: "new",
      created_at: "2025-03-10T00:00:00Z",
    } as Parameters<typeof dbToPayment>[0];

    const payment = dbToPayment(db);
    expect(payment.amount).toBe(150);
    expect(payment.kind).toBe("new");
    expect(payment.branchId).toBe("b1");
  });
});
