"use client";

import Link from "next/link";
import { Button } from "@/app/components/ui/Button";
import { Skeleton } from "@/app/components/Skeleton";
import { formatMonthArabic, formatDateArabic } from "@/src/lib/utils";
import { useFinancePage } from "./_useFinancePage";
import { CATEGORY_STYLES, CATEGORIES, type TxType, type Category, type PrintMode } from "./_types";
import { money, pct } from "./_utils";

// ── Page ───────────────────────────────────────────────────────────────────────
export default function FinancePage() {
  const {
    branches,
    staff,
    loading,
    pageError,
    autoSyncing,
    saving,
    saveError,
    groupedTxViews,
    paginatedGroupedTxViews,
    finTotalPages,
    branchPL,
    summary,
    subscriptionKPI,
    mom,
    selectedBranch,
    setSelectedBranch,
    selectedMonth,
    handleMonthChange,
    q,
    setQ,
    typeFilter,
    setTypeFilter,
    categoryFilter,
    setCategoryFilter,
    sourceFilter,
    setSourceFilter,
    sort,
    setSort,
    finPage,
    setFinPage,
    finPageSize,
    setFinPageSize,
    hasFinanceAccess,
    expandedTxIds,
    toggleExpand,
    printOpen,
    setPrintOpen,
    openMenu,
    setOpenMenu,
    plExpanded,
    setPlExpanded,
    open,
    setOpen,
    editId,
    type,
    setType,
    branchId,
    setBranchId,
    category,
    setCategory,
    amount,
    setAmount,
    dateISO,
    setDateISO,
    note,
    setNote,
    loadData,
    openAdd,
    openEdit,
    saveTx,
    removeTx,
    exportCSV,
    printFinance,
    branchName,
  } = useFinancePage();

  // ── UI ──────────────────────────────────────────────────────────────────────
  return (
    <main className="flex-1" onClick={() => setOpenMenu(null)}>

      {/* ── Page Header ── */}
      <div className="px-4 md:px-8 pt-6 pb-5 max-w-[1400px] mx-auto">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold text-white">الإدارة المالية</h1>
            <p className="mt-1 text-base text-white/50">
              نظرة عامة شاملة على أداء الأكاديمية المالي والتدفقات النقدية
              {autoSyncing && (
                <span className="mr-2 text-[#63C0B0] text-sm font-medium">● جاري المزامنة...</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <Link
              href="/finance/reports"
              className="h-9 px-4 rounded-xl bg-white/[0.07] border border-white/10 text-sm text-white/80 hover:bg-white/[0.11] transition font-medium inline-flex items-center"
            >
              التقارير
            </Link>
            <button
              type="button"
              onClick={() => setPrintOpen(true)}
              disabled={loading}
              className="h-9 px-4 rounded-xl bg-white/[0.07] border border-white/10 text-sm text-white/80 hover:bg-white/[0.11] transition font-medium disabled:opacity-40"
            >
              طباعة
            </button>
            <button
              type="button"
              onClick={exportCSV}
              disabled={loading}
              className="h-9 px-4 rounded-xl bg-white/[0.07] border border-white/10 text-sm text-white/80 hover:bg-white/[0.11] transition font-medium disabled:opacity-40"
            >
              CSV
            </button>
            {hasFinanceAccess && (
              <button
                type="button"
                onClick={openAdd}
                disabled={loading}
                className="h-9 px-5 rounded-xl bg-[#00ff9c] text-[#0B1220] text-sm font-bold hover:bg-[#00e08a] transition flex items-center gap-1.5 disabled:opacity-50"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                إضافة بند
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Error */}
      {pageError && (
        <div className="mx-4 md:mx-8 mb-4 max-w-[1400px] mx-auto rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {pageError}
          <button onClick={loadData} className="mr-3 underline" type="button">إعادة المحاولة</button>
        </div>
      )}
      {loading && (
        <div className="px-4 md:px-8 mb-4 max-w-[1400px] mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[148px] rounded-2xl" />
            ))}
          </div>
        </div>
      )}

      <div className="px-4 md:px-8 space-y-5 pb-10 max-w-[1400px] mx-auto">

        {/* ── Row 1: Primary KPI Cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">

          {/* إجمالي الإيرادات */}
          {(() => {
            const prev = summary.revenue - mom.dRevenue;
            const changePct = prev > 0 ? Math.round((mom.dRevenue / prev) * 1000) / 10 : 0;
            const up = mom.dRevenue >= 0;
            return (
              <div className="rounded-2xl bg-[#161a30] border border-white/[0.06] p-5 relative overflow-hidden min-h-[148px]">
                <div className="absolute inset-x-0 top-0 h-[2px] bg-emerald-400" />
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-base font-semibold text-white/55">إجمالي الإيرادات</div>
                    <div className="mt-2 text-3xl font-extrabold text-white leading-none">{money(summary.revenue)}</div>
                    <div className={`mt-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold border ${up ? "bg-emerald-400/10 text-emerald-300 border-emerald-400/20" : "bg-rose-500/10 text-rose-300 border-rose-400/20"}`}>
                      {up ? "↑" : "↓"} {Math.abs(changePct)}%+ من الشهر الماضي
                    </div>
                  </div>
                  <div className="shrink-0 h-11 w-11 rounded-xl bg-emerald-400/10 flex items-center justify-center">
                    <svg className="h-5 w-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* إجمالي المصاريف */}
          {(() => {
            const prev = summary.expenses - mom.dExpenses;
            const changePct = prev > 0 ? Math.round((mom.dExpenses / prev) * 1000) / 10 : 0;
            const up = mom.dExpenses >= 0;
            return (
              <div className="rounded-2xl bg-[#161a30] border border-white/[0.06] p-5 relative overflow-hidden min-h-[148px]">
                <div className="absolute inset-x-0 top-0 h-[2px] bg-rose-400" />
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-base font-semibold text-white/55">إجمالي المصاريف</div>
                    <div className="mt-2 text-3xl font-extrabold text-white leading-none">{money(summary.expenses)}</div>
                    <div className={`mt-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold border ${!up ? "bg-emerald-400/10 text-emerald-300 border-emerald-400/20" : "bg-rose-500/10 text-rose-300 border-rose-400/20"}`}>
                      {up ? "↑" : "↓"} {Math.abs(changePct)}%+ من الشهر الماضي
                    </div>
                  </div>
                  <div className="shrink-0 h-11 w-11 rounded-xl bg-rose-400/10 flex items-center justify-center">
                    <svg className="h-5 w-5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
                    </svg>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* صافي الربح */}
          {(() => {
            const prevProfit = summary.profit - mom.dProfit;
            const changePct = Math.abs(prevProfit) > 0 ? Math.round((mom.dProfit / Math.abs(prevProfit)) * 1000) / 10 : 0;
            const up = mom.dProfit >= 0;
            return (
              <div className="rounded-2xl bg-[#161a30] border border-white/[0.06] p-5 relative overflow-hidden min-h-[148px]">
                <div className="absolute inset-x-0 top-0 h-[2px] bg-[#00e0ff]" />
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-base font-semibold text-white/55">صافي الربح</div>
                    <div className={`mt-2 text-3xl font-extrabold leading-none ${summary.profit >= 0 ? "text-white" : "text-rose-300"}`}>
                      {money(summary.profit)}
                    </div>
                    <div className={`mt-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold border ${up ? "bg-emerald-400/10 text-emerald-300 border-emerald-400/20" : "bg-rose-500/10 text-rose-300 border-rose-400/20"}`}>
                      {up ? "↑" : "↓"} {Math.abs(changePct)}% معدل نمو
                    </div>
                  </div>
                  <div className="shrink-0 h-11 w-11 rounded-xl bg-[#00e0ff]/10 flex items-center justify-center">
                    <svg className="h-5 w-5 text-[#00e0ff]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* هامش الربح */}
          <div className="rounded-2xl bg-[#161a30] border border-white/[0.06] p-5 relative overflow-hidden min-h-[148px]">
            <div className="absolute inset-x-0 top-0 h-[2px] bg-white/20" />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-base font-semibold text-white/55">هامش الربح</div>
                <div className="mt-2 text-3xl font-extrabold text-white leading-none">{pct(summary.margin)}</div>
                <div className="mt-3 h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-l from-[#00ff9c] to-[#00e0ff] transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.max(0, summary.margin))}%` }}
                  />
                </div>
              </div>
              <div className="shrink-0 h-11 w-11 rounded-xl bg-white/[0.07] flex items-center justify-center">
                <svg className="h-5 w-5 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* ── Row 2: Secondary KPI Cards ── */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="rounded-2xl bg-[#161a30] border border-white/[0.06] p-5">
            <div className="text-sm text-white/50 font-medium">متوسط الدفع</div>
            <div className="mt-2 text-2xl font-extrabold text-white">{money(subscriptionKPI.avg)}</div>
            <div className="mt-1 text-xs text-white/35">لكل لاعب نشط</div>
          </div>
          <div className="rounded-2xl bg-[#161a30] border border-white/[0.06] p-5">
            <div className="text-sm text-white/50 font-medium">حجم الطلب</div>
            <div className="mt-2 text-2xl font-extrabold text-white">
              {subscriptionKPI.count}
              <span className="text-base font-medium text-white/50 mr-1">معاملة</span>
            </div>
            <div className="mt-1 text-xs text-white/35">جديد: {subscriptionKPI.newCount} | تجديد: {subscriptionKPI.renewCount}</div>
          </div>
          <div className="rounded-2xl bg-[#161a30] border border-white/[0.06] p-5">
            <div className="text-sm text-white/50 font-medium">الرواتب</div>
            <div className="mt-2 text-2xl font-extrabold text-white">{money(summary.salaries)}</div>
            <div className="mt-1 text-xs text-white/35">{staff.filter((s) => s.isActive).length} موظف ومدرب</div>
          </div>
          <div className="rounded-2xl bg-[#161a30] border border-white/[0.06] p-5">
            <div className="text-sm text-white/50 font-medium">حجز ملاعب</div>
            <div className="mt-2 text-2xl font-extrabold text-white">{money(summary.field)}</div>
            <div className="mt-1 text-xs text-[#63C0B0]/70">إيرادات المرافق</div>
          </div>
        </div>

        {/* ── Branch P&L Table ── */}
        {branchPL.length > 0 && (
          <div className="rounded-2xl bg-[#161a30] border border-white/[0.06] overflow-hidden">
            <button
              type="button"
              onClick={() => setPlExpanded((v) => !v)}
              className="w-full flex items-center justify-between px-5 py-4 text-right hover:bg-white/[0.02] transition"
            >
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-xl bg-[#00e0ff]/10 flex items-center justify-center">
                  <svg className="h-4 w-4 text-[#00e0ff]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-white">ربح وخسارة الفروع</div>
                  <div className="text-xs text-white/40 mt-0.5">{formatMonthArabic(selectedMonth)} · {branchPL.length} فرع</div>
                </div>
              </div>
              <svg
                className={`h-4 w-4 text-white/40 transition-transform ${plExpanded ? "rotate-180" : ""}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {plExpanded && (
              <div className="border-t border-white/[0.06]">
                {/* Header row */}
                <div className="grid grid-cols-4 gap-2 px-5 py-2 text-xs text-white/35 font-medium border-b border-white/[0.04]">
                  <div>الفرع</div>
                  <div className="text-left">الإيرادات</div>
                  <div className="text-left">المصاريف</div>
                  <div className="text-left">صافي الربح</div>
                </div>
                {/* Data rows */}
                {branchPL.map((row, idx) => {
                  const isProfit = row.profit >= 0;
                  return (
                    <div
                      key={row.id}
                      className={`grid grid-cols-4 gap-2 px-5 py-3.5 text-sm items-center ${
                        idx < branchPL.length - 1 ? "border-b border-white/[0.04]" : ""
                      } hover:bg-white/[0.02] transition`}
                    >
                      <div className="font-medium text-white/85 truncate">{row.name}</div>
                      <div className="text-emerald-400 font-semibold text-left">
                        {money(row.revenue)}
                      </div>
                      <div className="text-rose-400 font-semibold text-left">
                        {money(row.expenses)}
                      </div>
                      <div className={`font-bold text-left ${isProfit ? "text-[#00e0ff]" : "text-rose-300"}`}>
                        {isProfit ? "+" : ""}{money(row.profit)}
                      </div>
                    </div>
                  );
                })}
                {/* Totals row */}
                {branchPL.length > 1 && (() => {
                  const totRev = branchPL.reduce((s, r) => s + r.revenue, 0);
                  const totExp = branchPL.reduce((s, r) => s + r.expenses, 0);
                  const totPro = totRev - totExp;
                  return (
                    <div className="grid grid-cols-4 gap-2 px-5 py-3 bg-white/[0.03] border-t border-white/[0.08] text-sm">
                      <div className="text-xs font-bold text-white/60">الإجمالي</div>
                      <div className="text-emerald-300 font-bold text-left">{money(totRev)}</div>
                      <div className="text-rose-300 font-bold text-left">{money(totExp)}</div>
                      <div className={`font-bold text-left ${totPro >= 0 ? "text-[#00e0ff]" : "text-rose-300"}`}>
                        {totPro >= 0 ? "+" : ""}{money(totPro)}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {/* ── Filter Bar ── */}
        <div className="rounded-2xl bg-[#161a30] border border-white/[0.06] px-4 py-3 flex flex-wrap items-center gap-2">
          {/* Export icon */}
          <button
            type="button"
            onClick={exportCSV}
            disabled={loading}
            title="تصدير CSV"
            className="h-9 w-9 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/[0.10] transition disabled:opacity-40 shrink-0"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>

          {/* Search */}
          <div className="relative flex-1 min-w-[160px]">
            <svg className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/35 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35" />
            </svg>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="بحث مخصص..."
              className="w-full h-9 rounded-xl bg-white/[0.06] border border-white/10 pr-9 pl-3 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/20"
            />
          </div>

          {/* Month filter */}
          <div className="relative">
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => handleMonthChange(e.target.value)}
              className="h-9 rounded-xl bg-white/[0.06] border border-white/10 px-3 text-sm text-white/80 outline-none focus:border-white/20 cursor-pointer"
              title={`الشهر: ${formatMonthArabic(selectedMonth)}`}
            />
          </div>

          {/* Type filter */}
          <div className="relative">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as TxType | "all")}
              className="h-9 rounded-xl bg-white/[0.06] border border-white/10 pr-3 pl-7 text-sm text-white/80 outline-none focus:border-white/20 cursor-pointer appearance-none"
            >
              <option value="all">النوع: الكل</option>
              <option value="مصروف">النوع: مصروف</option>
              <option value="إيراد">النوع: إيراد</option>
            </select>
            <svg className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
          </div>

          {/* Category filter */}
          <div className="relative">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as Category | "all")}
              className="h-9 rounded-xl bg-white/[0.06] border border-white/10 pr-3 pl-7 text-sm text-white/80 outline-none focus:border-white/20 cursor-pointer appearance-none"
            >
              <option value="all">التصنيف: الكل</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>التصنيف: {c}</option>)}
            </select>
            <svg className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
          </div>

          {/* Branch filter */}
          <div className="relative">
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="h-9 rounded-xl bg-white/[0.06] border border-white/10 pr-3 pl-7 text-sm text-white/80 outline-none focus:border-white/20 cursor-pointer appearance-none"
            >
              <option value="all">الفرع: الكل</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>الفرع: {b.name}</option>
              ))}
            </select>
            <svg className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
          </div>

          {/* Source filter */}
          <div className="relative">
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value as "auto" | "manual" | "all")}
              className="h-9 rounded-xl bg-white/[0.06] border border-white/10 pr-3 pl-7 text-sm text-white/80 outline-none focus:border-white/20 cursor-pointer appearance-none"
            >
              <option value="all">المصدر: الكل</option>
              <option value="auto">المصدر: تلقائي</option>
              <option value="manual">المصدر: يدوي</option>
            </select>
            <svg className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
          </div>

          {/* Clear filters */}
          <button
            type="button"
            onClick={() => { setQ(""); setTypeFilter("all"); setCategoryFilter("all"); setSelectedBranch("all"); setSourceFilter("all"); }}
            className="h-9 px-4 rounded-xl border border-[#63C0B0]/35 bg-[#63C0B0]/8 text-[#63C0B0] text-sm font-medium hover:bg-[#63C0B0]/15 transition flex items-center gap-1.5 shrink-0"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
            </svg>
            تصفية النتائج
          </button>
        </div>

        {/* ── Transactions Table ── */}
        <div className="rounded-2xl bg-[#161a30] border border-white/[0.06] overflow-hidden">
          {/* Table header */}
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-white/[0.06] flex-wrap">
            <div className="flex items-center gap-1 rounded-xl bg-white/[0.05] p-1">
              <button
                type="button"
                onClick={() => setSort("date_desc")}
                className={`h-7 px-3 rounded-lg text-sm font-medium transition ${sort === "date_desc" ? "bg-[#63C0B0] text-[#0B1220]" : "text-white/55 hover:text-white/85"}`}
              >
                الأحدث
              </button>
              <button
                type="button"
                onClick={() => setSort("date_asc")}
                className={`h-7 px-3 rounded-lg text-sm font-medium transition ${sort === "date_asc" ? "bg-[#63C0B0] text-[#0B1220]" : "text-white/55 hover:text-white/85"}`}
              >
                الأقدم
              </button>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={finPageSize}
                onChange={(e) => setFinPageSize(Number(e.target.value) as 30 | 50)}
                className="h-8 rounded-xl bg-white/[0.05] border border-white/10 px-3 text-xs text-white/70 outline-none"
              >
                <option value={30}>30 / صفحة</option>
                <option value={50}>50 / صفحة</option>
              </select>
              <h2 className="text-lg font-bold text-white">آخر المعاملات المالية</h2>
            </div>
          </div>

          {/* Mobile transaction cards */}
          <div className="md:hidden divide-y divide-white/[0.04]">
            {loading ? (
              <div className="px-4 py-4 space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-16 rounded-xl bg-white/[0.04] animate-pulse" />
                ))}
              </div>
            ) : groupedTxViews.length === 0 ? (
              <div className="px-4 py-8 text-white/35 text-sm text-center">
                لا توجد بنود لهذا الشهر أو الفلتر المحدد.
              </div>
            ) : (
              paginatedGroupedTxViews.map(({ tx: t, subItems, grossAmount }) => {
                const isExpense  = t.type === "مصروف";
                const isExpanded = expandedTxIds.has(t.id);
                const hasDetails = subItems.length > 0;
                const dispAmt    = hasDetails ? grossAmount : t.amount;
                const catStyle   = CATEGORY_STYLES[t.category] ?? CATEGORY_STYLES["أخرى"];
                return (
                  <div key={t.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`h-2 w-2 rounded-full shrink-0 ${isExpense ? "bg-rose-400" : "bg-emerald-400"}`} />
                          <span className={`text-sm font-medium ${isExpense ? "text-rose-300" : "text-emerald-300"}`}>{t.type}</span>
                          <span className={`inline-flex px-2 py-0.5 rounded-lg text-xs font-semibold border ${catStyle}`}>{t.category}</span>
                          {t.source === "auto" && (
                            <span className="text-[10px] bg-white/[0.07] text-white/45 px-1.5 py-0.5 rounded-full border border-white/10">تلقائي</span>
                          )}
                          {t.overriddenAutoKey && (
                            <span className="text-[10px] bg-amber-500/15 text-amber-300/80 px-1.5 py-0.5 rounded-full border border-amber-500/20">معدّل</span>
                          )}
                        </div>
                        <div className="mt-1 text-xs text-white/45">
                          {formatDateArabic(t.dateISO)} · {branchName(t.branchId)}
                        </div>
                        {t.note && <div className="mt-0.5 text-xs text-white/40 truncate">{t.note}</div>}
                      </div>
                      <div className="text-right shrink-0">
                        <div className={`text-base font-bold ${isExpense ? "text-rose-300" : "text-emerald-300"}`}>
                          {isExpense ? "− " : "+ "}{money(dispAmt)}
                        </div>
                        {hasDetails && <div className="text-[10px] text-white/35 mt-0.5">{subItems.length} بند</div>}
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      {hasDetails && (
                        <button
                          type="button"
                          onClick={() => toggleExpand(t.id)}
                          className="text-xs text-white/40 hover:text-white/70 transition"
                        >
                          {isExpanded ? "▲ إخفاء" : "▼ تفاصيل"}
                        </button>
                      )}
                      {hasFinanceAccess && (
                        <>
                          <button type="button" onClick={() => openEdit(t)} className="text-xs text-[#63C0B0] hover:text-white transition">تعديل</button>
                          <button type="button" onClick={() => removeTx(t)} className="text-xs text-rose-400 hover:text-rose-300 transition">حذف</button>
                        </>
                      )}
                    </div>
                    {isExpanded && (
                      <div className="mt-2 space-y-1 pr-2">
                        {subItems.map((sub) => (
                          <div key={sub.id} className="flex items-center justify-between text-xs text-white/45">
                            <span>{sub.label}</span>
                            <span className={sub.amount < 0 ? "text-rose-400" : "text-emerald-400"}>
                              {sub.amount < 0 ? `− ${money(Math.abs(sub.amount))}` : `+ ${money(sub.amount)}`}
                            </span>
                          </div>
                        ))}
                        {hasDetails && (
                          <div className="flex items-center justify-between text-xs font-semibold border-t border-white/10 pt-1 mt-1">
                            <span className="text-white/45">الإجمالي</span>
                            <span className="text-white">{money(grossAmount)}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <div className="min-w-[860px]">
              {/* Column headers */}
              <div className="grid grid-cols-[1.5fr_1fr_1fr_1.2fr_1fr_2fr_0.5fr] bg-white/[0.03] px-6 py-3 text-sm font-semibold text-white/40 border-b border-white/[0.06]">
                <div>التاريخ</div>
                <div>النوع</div>
                <div>التصنيف</div>
                <div>الفرع</div>
                <div>المبلغ</div>
                <div>ملاحظات</div>
                <div></div>
              </div>

              {/* Rows */}
              <div className="divide-y divide-white/[0.04]">
                {loading ? (
                  <div className="px-4 py-4 space-y-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <Skeleton key={i} className="h-14 rounded-xl" />
                    ))}
                  </div>
                ) : groupedTxViews.length === 0 ? (
                  <div className="px-6 py-12 text-white/35 text-sm text-center">
                    لا توجد بنود لهذا الشهر أو الفلتر المحدد.
                  </div>
                ) : (
                  paginatedGroupedTxViews.map(({ tx: t, subItems, grossAmount }) => {
                    const isExpense  = t.type === "مصروف";
                    const isExpanded = expandedTxIds.has(t.id);
                    const hasDetails = subItems.length > 0;
                    const dispAmt    = hasDetails ? grossAmount : t.amount;
                    const catStyle   = CATEGORY_STYLES[t.category] ?? CATEGORY_STYLES["أخرى"];

                    return (
                      <div key={t.id}>
                        {/* Main row */}
                        <div className="grid grid-cols-[1.5fr_1fr_1fr_1.2fr_1fr_2fr_0.5fr] px-6 py-4 items-center hover:bg-white/[0.02] transition-colors">
                          {/* Date */}
                          <div className="text-sm text-white/80 flex items-center gap-2">
                            {hasDetails && (
                              <button
                                type="button"
                                onClick={() => toggleExpand(t.id)}
                                className="text-white/30 hover:text-white/65 transition text-[10px] shrink-0"
                                aria-label={isExpanded ? "طي" : "توسيع"}
                              >
                                {isExpanded ? "▲" : "▼"}
                              </button>
                            )}
                            {formatDateArabic(t.dateISO)}
                          </div>

                          {/* Type with dot */}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`h-2 w-2 rounded-full shrink-0 ${isExpense ? "bg-rose-400" : "bg-emerald-400"}`} />
                            <span className={`text-sm font-medium ${isExpense ? "text-rose-300" : "text-emerald-300"}`}>
                              {t.type}
                            </span>
                            {t.source === "auto" && (
                              <span className="text-[10px] bg-white/[0.07] text-white/45 px-1.5 py-0.5 rounded-full border border-white/10">
                                تلقائي
                              </span>
                            )}
                            {t.overriddenAutoKey && (
                              <span
                                className="text-[10px] bg-amber-500/15 text-amber-300/80 px-1.5 py-0.5 rounded-full border border-amber-500/20"
                                title="تم تعديل هذا البند يدوياً — لن يتم تحديثه تلقائياً"
                              >
                                معدّل
                              </span>
                            )}
                          </div>

                          {/* Category badge */}
                          <div>
                            <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-semibold border ${catStyle}`}>
                              {t.category}
                            </span>
                          </div>

                          {/* Branch */}
                          <div className="text-sm text-white/60 truncate">{branchName(t.branchId)}</div>

                          {/* Amount */}
                          <div className={`text-sm font-bold ${isExpense ? "text-rose-300" : "text-emerald-300"}`}>
                            {isExpense ? "− " : "+ "}{money(dispAmt)}
                            {hasDetails && !isExpanded && (
                              <div className="text-[10px] text-white/35 mt-0.5 font-normal">{subItems.length} بند</div>
                            )}
                          </div>

                          {/* Notes */}
                          <div className="text-sm text-white/45 truncate" title={t.note || undefined}>
                            {t.note || "—"}
                          </div>

                          {/* Three-dot menu */}
                          <div className="relative flex justify-end" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => setOpenMenu(openMenu === t.id ? null : t.id)}
                              className="h-7 w-7 rounded-lg text-white/35 hover:text-white/75 hover:bg-white/[0.07] transition flex items-center justify-center"
                              aria-label="الإجراءات"
                            >
                              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                                <circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" />
                              </svg>
                            </button>
                            {openMenu === t.id && (
                              <div className="absolute left-0 top-8 z-30 w-40 rounded-xl bg-[#0F172A] border border-white/10 shadow-2xl overflow-hidden">
                                {hasDetails && (
                                  <button
                                    type="button"
                                    onClick={() => { toggleExpand(t.id); setOpenMenu(null); }}
                                    className="w-full text-right px-4 py-2.5 text-sm text-white/70 hover:bg-white/[0.07] transition"
                                  >
                                    {isExpanded ? "إخفاء التفاصيل" : "عرض التفاصيل"}
                                  </button>
                                )}
                                {hasFinanceAccess && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => { openEdit(t); setOpenMenu(null); }}
                                      className="w-full text-right px-4 py-2.5 text-sm text-white/70 hover:bg-white/[0.07] transition"
                                    >
                                      تعديل
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => { removeTx(t); setOpenMenu(null); }}
                                      className="w-full text-right px-4 py-2.5 text-sm text-rose-400 hover:bg-rose-500/10 transition"
                                    >
                                      حذف
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Sub-item rows */}
                        {isExpanded && subItems.map((sub) => (
                          <div
                            key={sub.id}
                            className="grid grid-cols-[1.5fr_1fr_1fr_1.2fr_1fr_2fr_0.5fr] px-6 py-2.5 items-center bg-[#0d1424] border-t border-white/[0.04]"
                          >
                            <div className="text-xs text-white/35 pr-5">{sub.date || ""}</div>
                            <div />
                            <div className="text-xs text-white/30">تفصيل</div>
                            <div />
                            <div className={`text-xs font-semibold ${sub.amount < 0 ? "text-rose-400" : "text-emerald-400"}`}>
                              {sub.amount < 0 ? `− ${money(Math.abs(sub.amount))}` : `+ ${money(sub.amount)}`}
                            </div>
                            <div className="text-xs text-white/40">{sub.label}</div>
                            <div />
                          </div>
                        ))}

                        {/* Net summary row */}
                        {isExpanded && hasDetails && (
                          <div className="grid grid-cols-[1.5fr_1fr_1fr_1.2fr_1fr_2fr_0.5fr] px-6 py-2.5 items-center bg-[#0d1424] border-t border-white/10">
                            <div /><div /><div />
                            <div className="text-xs font-semibold text-white/45">الإجمالي</div>
                            <div className="text-sm font-bold text-white">{money(grossAmount)}</div>
                            <div /><div />
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>{/* hidden md:block */}

          {/* Pagination controls */}
          {groupedTxViews.length > finPageSize && (
            <div className="px-6 py-4 flex items-center justify-between gap-3 border-t border-white/[0.06] flex-wrap">
              <span className="text-xs text-white/40">
                {(finPage - 1) * finPageSize + 1}–{Math.min(finPage * finPageSize, groupedTxViews.length)} من {groupedTxViews.length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFinPage((p) => Math.max(1, p - 1))}
                  disabled={finPage === 1}
                  className="h-8 px-3 rounded-lg border border-white/10 bg-white/5 text-xs text-white/70 hover:bg-white/10 disabled:opacity-30 transition"
                >
                  السابق
                </button>
                <span className="text-xs text-white/50">{finPage} / {finTotalPages}</span>
                <button
                  type="button"
                  onClick={() => setFinPage((p) => Math.min(finTotalPages, p + 1))}
                  disabled={finPage === finTotalPages}
                  className="h-8 px-3 rounded-lg border border-white/10 bg-white/5 text-xs text-white/70 hover:bg-white/10 disabled:opacity-30 transition"
                >
                  التالي
                </button>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* ── Modal ── */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-[760px] rounded-[28px] bg-[#111827] border border-white/10 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="px-4 sm:px-8 pt-6 sm:pt-8 flex items-start justify-between">
              <div>
                <h2 className="text-3xl font-semibold">
                  {editId ? "تعديل بند" : "إضافة بند"}
                </h2>
                <p className="mt-2 text-white/60 text-sm">
                  يمكنك إضافة بنود يدوية أو تعديل بنود تلقائية.
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="h-10 w-10 rounded-xl bg-white/5 hover:bg-white/10 transition text-xl leading-none"
                aria-label="إغلاق"
              >
                ×
              </button>
            </div>

            <div className="px-8 py-6 space-y-4">
              {saveError && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
                  {saveError}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-white/70 mb-2">النوع</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as TxType)}
                    className="w-full h-11 rounded-xl bg-[#0F172A] border border-white/10 px-4 text-white outline-none focus:border-white/25"
                  >
                    <option value="مصروف">مصروف</option>
                    <option value="إيراد">إيراد</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-white/70 mb-2">التاريخ</label>
                  <input
                    type="date"
                    value={dateISO}
                    onChange={(e) => setDateISO(e.target.value)}
                    className="w-full h-11 rounded-xl bg-[#0F172A] border border-white/10 px-4 text-white outline-none focus:border-white/25"
                  />
                </div>

                <div>
                  <label className="block text-sm text-white/70 mb-2">الفرع</label>
                  <select
                    value={branchId}
                    onChange={(e) => setBranchId(e.target.value)}
                    className="w-full h-11 rounded-xl bg-[#0F172A] border border-white/10 px-4 text-white outline-none focus:border-white/25"
                  >
                    <option value="all">عام (الأكاديمية)</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-white/70 mb-2">التصنيف</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as Category)}
                    className="w-full h-11 rounded-xl bg-[#0F172A] border border-white/10 px-4 text-white outline-none focus:border-white/25"
                  >
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm text-white/70 mb-2">المبلغ (د.ك)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={amount === 0 ? "" : String(amount)}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9]/g, "");
                      setAmount(v ? Number(v) : 0);
                    }}
                    className="w-full h-11 rounded-xl bg-[#0F172A] border border-white/10 px-4 text-white outline-none focus:border-white/25"
                    placeholder="مثال: 360"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm text-white/70 mb-2">ملاحظات</label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="w-full min-h-[90px] rounded-xl bg-[#0F172A] border border-white/10 px-4 py-3 text-white outline-none focus:border-white/25"
                    placeholder="مثال: خصم على الملعب هذا الشهر..."
                  />
                </div>
              </div>
            </div>

            <div className="px-8 pb-8 flex items-center justify-start gap-3">
              <Button variant="secondary" onClick={() => setOpen(false)}>إلغاء</Button>
              <Button onClick={saveTx} disabled={saving}>
                {saving ? "جاري الحفظ..." : editId ? "حفظ التعديل" : "إضافة"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Print dialog ── */}
      {printOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-[24px] bg-[#111827] border border-white/10 shadow-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-semibold">خيارات الطباعة</h2>
              <button
                onClick={() => setPrintOpen(false)}
                className="h-9 w-9 rounded-xl bg-white/5 hover:bg-white/10 transition text-xl leading-none"
                aria-label="إغلاق"
              >
                ×
              </button>
            </div>
            <p className="text-sm text-white/50 mb-4">
              سيتم طباعة البنود المرشّحة حالياً ({groupedTxViews.length} بند).
            </p>
            <div className="space-y-2">
              {([
                { mode: "main_only", label: "أ — البنود الرئيسية فقط" },
                { mode: "with_sub",  label: "ب — البنود الرئيسية مع التفاصيل" },
                { mode: "revenues",  label: "ج — الإيرادات فقط" },
                { mode: "expenses",  label: "د — المصروفات فقط" },
                { mode: "all",       label: "هـ — الكل مع التفاصيل" },
              ] as { mode: PrintMode; label: string }[]).map(({ mode, label }) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => printFinance(mode)}
                  className="w-full text-right h-11 px-4 rounded-xl bg-white/5 hover:bg-[#63C0B0]/15 hover:text-[#63C0B0] transition text-sm font-medium border border-white/10"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
