"use client";

import Link from "next/link";
import { Button } from "@/app/components/ui/Button";
import { Skeleton } from "@/app/components/Skeleton";
import { isoToDDMMYYYY } from "@/src/lib/utils";
import {
  statusStyles,
  EVENT_CONFIG,
  FILTER_BUTTONS,
  type SubscriptionMode,
} from "./_types";
import {
  calcStatusFromEnd,
  remainingSessions,
  computeExtendEndISO,
} from "./_utils";
import { usePlayersPage } from "./_usePlayersPage";

// ── Page ──────────────────────────────────────────────────────────────────────
export default function PlayersPage() {
  const {
    // Data
    players,
    branches,
    canManage,
    // Loading / error
    loading,
    pageError,
    saving,
    saveError,
    // Filters
    activeFilter, setActiveFilter,
    searchTerm, setSearchTerm,
    branchFilter, setBranchFilter,
    pageSize, setPageSize,
    currentPage, setCurrentPage,
    // Derived
    branchMap,
    filteredPlayers,
    paginatedPlayers,
    totalPages,
    allFilteredSelected,
    // Modal state
    open, setOpen,
    modalType,
    activePlayerId,
    // Form fields
    name, setName,
    birth, setBirth,
    phone, setPhone,
    branchId,
    startDate,
    startDateText,
    subscriptionMode, setSubscriptionMode,
    sessionsInput, setSessionsInput,
    priceInput, setPriceInput,
    isLegacy, setIsLegacy,
    // Extend
    extendDays, setExtendDays,
    // Pause
    pauseToggling,
    // Bulk
    selectedIds, setSelectedIds,
    bulkExtendDays, setBulkExtendDays,
    bulkConfirm, setBulkConfirm,
    bulkTransferBranchId, setBulkTransferBranchId,
    bulkProcessing,
    // History
    historyEvents,
    historyLoading,
    historyPlayerName,
    // Avatar
    avatarFile, setAvatarFile,
    avatarPreview, setAvatarPreview,
    // Operations
    loadData,
    applyBranchSettings,
    handleStartDateTextChange,
    computeEndPreview,
    printPlayers,
    openAddModal,
    openEditModal,
    openRenewModal,
    openExtendModal,
    openHistoryModal,
    savePlayer,
    doExtend,
    doTogglePause,
    doBulkExtend,
    doBulkPause,
    doBulkTransfer,
    doBulkDelete,
    toggleSelectAll,
    toggleSelect,
  } = usePlayersPage();

  // ── UI ─────────────────────────────────────────────────────────────────────
  return (
    <main className="flex-1 p-4 md:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <h1 className="text-xl md:text-2xl font-semibold">اللاعبين</h1>
        <Link
          href="/players/attendance"
          className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs md:text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
        >
          📋 سجل الحضور
        </Link>
      </div>

      {/* Page-level error */}
      {pageError && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {pageError}
          <button
            onClick={loadData}
            className="mr-3 underline text-red-300 hover:text-red-200"
            type="button"
          >
            إعادة المحاولة
          </button>
        </div>
      )}

      {/* Control Bar */}
      <div className="bg-[#111827] rounded-2xl p-4 space-y-3">
        {/* Row 1: Search + Branch filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full sm:flex-1 h-11 rounded-xl bg-[#0F172A] border border-white/10 px-4 text-white outline-none focus:border-white/25"
            placeholder="ابحث بالاسم أو رقم ولي الأمر…"
          />
          <select
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            className="w-full sm:w-[220px] h-11 rounded-xl bg-[#0F172A] border border-white/10 px-4 text-white outline-none focus:border-white/25"
          >
            <option value="all">كل الفروع (الأكاديمية)</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        {/* Row 2: Status filter chips */}
        <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
          {FILTER_BUTTONS.map((btn) => {
            const isActive = activeFilter === btn.key;
            return (
              <button
                key={btn.key}
                onClick={() => setActiveFilter(btn.key)}
                className={[
                  "shrink-0 h-9 px-4 rounded-full text-sm transition",
                  isActive
                    ? "bg-white/10 text-white"
                    : "bg-[#0F172A] text-white/70 hover:bg-white/5 hover:text-white",
                ].join(" ")}
                type="button"
              >
                {btn.label}
              </button>
            );
          })}
        </div>

        {/* Row 3: Actions */}
        <div className="flex items-center gap-3 flex-wrap">
          {canManage && (
            <Button onClick={openAddModal} disabled={loading}>
              + إضافة لاعب
            </Button>
          )}

          {!loading && branches.length === 0 && (
            <div className="text-xs text-amber-200/90">
              لا يوجد فروع بعد — أضف فرعًا من صفحة الفروع أولاً.
            </div>
          )}

          <div className="text-xs text-white/50">
            عدد النتائج:{" "}
            <span className="text-white">{filteredPlayers.length}</span>
          </div>

          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value) as 30 | 50)}
            className="h-9 rounded-xl bg-[#0F172A] border border-white/10 px-3 text-xs text-white outline-none focus:border-white/25"
          >
            <option value={30}>30 / صفحة</option>
            <option value={50}>50 / صفحة</option>
          </select>

          <Button
            variant="secondary"
            onClick={() => printPlayers(filteredPlayers)}
            disabled={loading}
          >
            🖨️ طباعة القائمة
          </Button>
        </div>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="mt-4 space-y-3 md:hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[120px] rounded-2xl" />
          ))}
        </div>
      )}
      {loading && (
        <div className="mt-4 hidden md:block space-y-2">
          <Skeleton className="h-10 rounded-xl" />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      )}

      {!loading && (
        <>
          {/* ── Mobile card list (hidden on md+) ─────────────────────────── */}
          <div className="mt-4 md:hidden space-y-3">
            {filteredPlayers.length === 0 ? (
              <div className="py-8 text-center text-sm text-white/60">
                لا توجد نتائج مطابقة.
              </div>
            ) : (
              paginatedPlayers.map((r) => {
                const b = r.branchId ? branchMap.get(r.branchId) : undefined;
                const branchName = b?.name ?? "—";
                const liveStatus = calcStatusFromEnd(r.end, r.isPaused);
                const remaining = r.subscriptionMode === "حصص"
                  ? (remainingSessions(r, b) ?? r.sessions)
                  : null;
                const sessionsPct = remaining !== null && r.sessions > 0
                  ? Math.round((remaining / r.sessions) * 100)
                  : 0;
                const isSelected = selectedIds.has(r.id);
                const initials = r.name.trim()[0] ?? "؟";

                return (
                  <div
                    key={r.id}
                    className={[
                      "bg-[#111827] rounded-2xl p-4 border transition",
                      isSelected ? "border-[#63C0B0]/40" : "border-white/5",
                    ].join(" ")}
                  >
                    {/* Card header: checkbox + avatar + name + status */}
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(r.id)}
                          className="h-4 w-4 rounded shrink-0"
                          aria-label={`تحديد ${r.name}`}
                        />
                        {r.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={r.avatarUrl}
                            alt={r.name}
                            className="h-10 w-10 rounded-full object-cover shrink-0 border border-white/10"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-full bg-[#00ff9c]/10 border border-[#00ff9c]/20 flex items-center justify-center text-base font-bold text-[#00ff9c] shrink-0">
                            {initials}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-sm text-white/90 flex items-center gap-1.5 flex-wrap">
                            {r.name}
                            {r.isLegacy && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300">قديم</span>
                            )}
                            {r.isPaused && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400">تجميد</span>
                            )}
                          </div>
                          <div className="text-[10px] text-white/30 font-mono mt-0.5">{r.id.slice(0, 8)}</div>
                        </div>
                      </div>
                      <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs ${statusStyles[liveStatus]}`}>
                        {liveStatus}
                      </span>
                    </div>

                    {/* Details grid */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs mb-3 px-1">
                      <div>
                        <div className="text-white/35 mb-0.5">الفرع</div>
                        <div className="text-white/80 truncate">{branchName}</div>
                      </div>
                      <div>
                        <div className="text-white/35 mb-0.5">سنة الميلاد</div>
                        <div className="text-white/80">{String(r.birth).slice(0, 4)}</div>
                      </div>
                      <div>
                        <div className="text-white/35 mb-0.5">تاريخ الانتهاء</div>
                        <div className="text-white/80">{r.end || "—"}</div>
                      </div>
                      <div>
                        <div className="text-white/35 mb-0.5">الحصص المتبقية</div>
                        {remaining !== null ? (
                          <div>
                            <div className="text-white/80">{remaining}<span className="text-white/35"> / {r.sessions}</span></div>
                            <div className="mt-1 h-1 rounded-full bg-white/8 overflow-hidden w-16">
                              <div
                                className={`h-full rounded-full ${sessionsPct > 50 ? "bg-[#00ff9c]" : sessionsPct > 20 ? "bg-amber-400" : "bg-rose-400"}`}
                                style={{ width: `${Math.max(0, Math.min(100, sessionsPct))}%` }}
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="text-white/45">شهري</div>
                        )}
                      </div>
                    </div>

                    {/* Actions: 3 icon buttons */}
                    <div className="flex items-center gap-2 pt-3 border-t border-white/5">
                      <button
                        type="button"
                        title="سجل اللاعب"
                        onClick={() => openHistoryModal(r.id)}
                        className="flex-1 h-9 rounded-xl flex items-center justify-center gap-1.5 border border-white/10 bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/80 transition text-xs"
                      >
                        <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        السجل
                      </button>
                      {canManage && (
                        <button
                          type="button"
                          title="تعديل اللاعب"
                          onClick={() => openEditModal(r.id)}
                          className="flex-1 h-9 rounded-xl flex items-center justify-center gap-1.5 border border-white/10 bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/80 transition text-xs"
                        >
                          <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                          تعديل
                        </button>
                      )}
                      <button
                        type="button"
                        title="تجديد الاشتراك"
                        onClick={() => openRenewModal(r.id)}
                        className="flex-1 h-9 rounded-xl flex items-center justify-center gap-1.5 border border-[#00ff9c]/25 bg-[#00ff9c]/[0.08] text-[#00ff9c]/70 hover:bg-[#00ff9c]/15 hover:text-[#00ff9c] transition text-xs font-medium"
                      >
                        <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        تجديد
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* ── Desktop table (hidden on mobile) ─────────────────────────── */}
          <div className="mt-6 hidden md:block bg-[#111827] rounded-2xl overflow-hidden border border-white/5">
            {/* Header */}
            <div className="bg-[#0F172A] px-5 py-3.5 grid grid-cols-[0.4fr_2.6fr_1.2fr_0.7fr_2fr_1.3fr_1fr_1.4fr] gap-4 items-center border-b border-white/[0.06]">
              <div className="flex items-center justify-center">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded"
                  aria-label="تحديد الجميع"
                />
              </div>
              <div className="text-xs font-semibold uppercase tracking-wider text-white/40">اللاعب</div>
              <div className="text-xs font-semibold uppercase tracking-wider text-white/40">الفرع</div>
              <div className="text-xs font-semibold uppercase tracking-wider text-white/40">الميلاد</div>
              <div className="text-xs font-semibold uppercase tracking-wider text-white/40">الحصص المتبقية</div>
              <div className="text-xs font-semibold uppercase tracking-wider text-white/40">تاريخ الانتهاء</div>
              <div className="text-xs font-semibold uppercase tracking-wider text-white/40">الحالة</div>
              <div className="text-xs font-semibold uppercase tracking-wider text-white/40 text-center">الإجراءات</div>
            </div>

            <div className="divide-y divide-white/[0.04]">
              {paginatedPlayers.map((r) => {
                const b = r.branchId ? branchMap.get(r.branchId) : undefined;
                const branchName = b?.name ?? "—";
                const liveStatus = calcStatusFromEnd(r.end, r.isPaused);
                const remaining = r.subscriptionMode === "حصص"
                  ? (remainingSessions(r, b) ?? r.sessions)
                  : null;
                const sessionsPct = remaining !== null && r.sessions > 0
                  ? Math.round((remaining / r.sessions) * 100)
                  : 0;
                const isSelected = selectedIds.has(r.id);
                const initials = r.name.trim()[0] ?? "؟";

                return (
                  <div
                    key={r.id}
                    className={[
                      "px-5 py-4 grid grid-cols-[0.4fr_2.6fr_1.2fr_0.7fr_2fr_1.3fr_1fr_1.4fr] gap-4 items-center transition-colors hover:bg-white/[0.015]",
                      isSelected ? "bg-[#63C0B0]/[0.04] ring-1 ring-inset ring-[#63C0B0]/20" : "",
                    ].join(" ")}
                  >
                    {/* Checkbox */}
                    <div className="flex items-center justify-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(r.id)}
                        className="h-4 w-4 rounded"
                        aria-label={`تحديد ${r.name}`}
                      />
                    </div>

                    {/* Player: avatar + name + short ID */}
                    <div className="flex items-center gap-3 min-w-0">
                      {r.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={r.avatarUrl}
                          alt={r.name}
                          className="h-9 w-9 rounded-full object-cover shrink-0 border border-white/10"
                        />
                      ) : (
                        <div className="h-9 w-9 rounded-full bg-[#00ff9c]/10 border border-[#00ff9c]/20 flex items-center justify-center text-sm font-bold text-[#00ff9c] shrink-0 select-none">
                          {initials}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white/90 flex items-center gap-1.5 flex-wrap leading-snug">
                          {r.name}
                          {r.isLegacy && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300">قديم</span>
                          )}
                          {r.isPaused && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400">تجميد</span>
                          )}
                        </div>
                        <div className="text-[10px] text-white/25 font-mono mt-0.5 tracking-wider">{r.id.slice(0, 8)}</div>
                      </div>
                    </div>

                    {/* Branch */}
                    <div className="text-sm text-white/65 truncate">{branchName}</div>

                    {/* Birth year */}
                    <div className="text-sm text-white/65">{String(r.birth).slice(0, 4)}</div>

                    {/* Remaining sessions + progress bar */}
                    <div>
                      {remaining !== null ? (
                        <div>
                          <div className="text-sm">
                            <span className="font-semibold text-white/90">{remaining}</span>
                            <span className="text-white/35 text-xs"> / {r.sessions}</span>
                          </div>
                          <div className="mt-1.5 h-1.5 rounded-full bg-white/[0.07] overflow-hidden w-24">
                            <div
                              className={`h-full rounded-full transition-all ${sessionsPct > 50 ? "bg-[#00ff9c]" : sessionsPct > 20 ? "bg-amber-400" : "bg-rose-400"}`}
                              style={{ width: `${Math.max(0, Math.min(100, sessionsPct))}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-white/40 px-2 py-0.5 rounded-full bg-white/[0.05] border border-white/[0.08]">شهري</span>
                      )}
                    </div>

                    {/* Expiry date */}
                    <div className="text-sm text-white/65">{r.end || "—"}</div>

                    {/* Status badge */}
                    <div>
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${statusStyles[liveStatus]}`}>
                        {liveStatus}
                      </span>
                    </div>

                    {/* Actions: history · edit · renew */}
                    <div className="flex items-center justify-center gap-1.5">
                      {/* History */}
                      <button
                        type="button"
                        title="سجل اللاعب"
                        onClick={() => openHistoryModal(r.id)}
                        className="h-8 w-8 rounded-lg flex items-center justify-center border border-white/10 bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/80 transition"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </button>
                      {/* Edit */}
                      {canManage && (
                        <button
                          type="button"
                          title="تعديل اللاعب"
                          onClick={() => openEditModal(r.id)}
                          className="h-8 w-8 rounded-lg flex items-center justify-center border border-white/10 bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/80 transition"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                      )}
                      {/* Renew — green accent */}
                      <button
                        type="button"
                        title="تجديد الاشتراك"
                        onClick={() => openRenewModal(r.id)}
                        className="h-8 w-8 rounded-lg flex items-center justify-center border border-[#00ff9c]/25 bg-[#00ff9c]/[0.08] text-[#00ff9c]/65 hover:bg-[#00ff9c]/15 hover:text-[#00ff9c] transition"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })}

              {filteredPlayers.length === 0 && (
                <div className="px-5 py-10 text-sm text-white/50 text-center">
                  لا توجد نتائج مطابقة.
                </div>
              )}
            </div>
          </div>

          {/* ── Pagination controls ────────────────────────────────────────── */}
          {filteredPlayers.length > pageSize && (
            <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
              <span className="text-xs text-white/40">
                {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredPlayers.length)} من {filteredPlayers.length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="h-8 px-3 rounded-lg border border-white/10 bg-white/5 text-xs text-white/70 hover:bg-white/10 disabled:opacity-30 transition"
                >
                  السابق
                </button>
                <span className="text-xs text-white/50">{currentPage} / {totalPages}</span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="h-8 px-3 rounded-lg border border-white/10 bg-white/5 text-xs text-white/70 hover:bg-white/10 disabled:opacity-30 transition"
                >
                  التالي
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Feature D: Floating bulk action bar ──────────────────────────── */}
      {canManage && selectedIds.size > 0 && (
        <div className="fixed bottom-6 inset-x-0 flex justify-center z-40 pointer-events-none px-4">
          <div className="pointer-events-auto bg-[#111827] border border-white/20 rounded-2xl px-4 py-3 shadow-2xl flex flex-wrap items-center gap-3">
            <span className="text-sm text-white/70 shrink-0">
              تم تحديد {selectedIds.size} لاعب
            </span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                value={bulkExtendDays}
                onChange={(e) => setBulkExtendDays(Math.max(1, Number(e.target.value) || 1))}
                className="w-16 h-8 rounded-lg bg-[#0F172A] border border-white/10 px-2 text-xs text-white outline-none"
                aria-label="عدد أيام التمديد"
              />
              <span className="text-xs text-white/50 shrink-0">يوم</span>
            </div>
            <button
              type="button"
              onClick={() => setBulkConfirm("extend")}
              disabled={bulkProcessing}
              className="rounded-xl bg-[#63C0B0]/20 border border-[#63C0B0]/40 px-4 py-2 text-xs font-semibold text-[#63C0B0] hover:bg-[#63C0B0]/30 transition disabled:opacity-50"
            >
              تمديد
            </button>
            <button
              type="button"
              onClick={() => setBulkConfirm("pause")}
              disabled={bulkProcessing}
              className="rounded-xl bg-blue-500/20 border border-blue-500/40 px-4 py-2 text-xs font-semibold text-blue-300 hover:bg-blue-500/30 transition disabled:opacity-50"
            >
              تجميد
            </button>
            <div className="flex items-center gap-1.5">
              <select
                value={bulkTransferBranchId}
                onChange={(e) => setBulkTransferBranchId(e.target.value)}
                className="h-8 rounded-lg bg-[#0F172A] border border-white/10 px-2 text-xs text-white outline-none"
              >
                <option value="">نقل إلى فرع…</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => bulkTransferBranchId && setBulkConfirm("transfer")}
                disabled={bulkProcessing || !bulkTransferBranchId}
                className="rounded-xl bg-amber-500/20 border border-amber-500/40 px-3 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500/30 transition disabled:opacity-50"
              >
                نقل
              </button>
            </div>
            <button
              type="button"
              onClick={() => setBulkConfirm("delete")}
              disabled={bulkProcessing}
              className="rounded-xl bg-red-500/20 border border-red-500/40 px-4 py-2 text-xs font-semibold text-red-300 hover:bg-red-500/30 transition disabled:opacity-50"
            >
              حذف
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              disabled={bulkProcessing}
              className="rounded-xl bg-white/5 border border-white/15 px-4 py-2 text-xs text-white/60 hover:bg-white/10 hover:text-white transition disabled:opacity-50"
            >
              إلغاء التحديد
            </button>
          </div>
        </div>
      )}

      {/* ── Feature D: Bulk confirmation dialog ──────────────────────────── */}
      {bulkConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#111827] border border-white/10 rounded-2xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold mb-3">تأكيد</h3>
            <p className="text-sm text-white/70 mb-6">
              {bulkConfirm === "delete"
                ? `هل أنت متأكد؟ سيتم حذف ${selectedIds.size} لاعبين نهائياً`
                : bulkConfirm === "pause"
                ? `سيتم تجميد اشتراك ${selectedIds.size} لاعبين`
                : bulkConfirm === "transfer"
                ? `سيتم نقل ${selectedIds.size} لاعبين إلى فرع "${branches.find(b => b.id === bulkTransferBranchId)?.name ?? ""}"`
                : `سيتم تمديد اشتراك ${selectedIds.size} لاعبين بـ ${bulkExtendDays} يوم`}
            </p>
            <div className="flex gap-3">
              <Button
                variant="secondary"
                onClick={() => setBulkConfirm(null)}
                disabled={bulkProcessing}
              >
                إلغاء
              </Button>
              <Button
                variant={bulkConfirm === "delete" ? "danger" : "primary"}
                onClick={
                  bulkConfirm === "delete" ? doBulkDelete
                  : bulkConfirm === "pause" ? doBulkPause
                  : bulkConfirm === "transfer" ? doBulkTransfer
                  : doBulkExtend
                }
                disabled={bulkProcessing}
              >
                {bulkProcessing ? "جاري التنفيذ..." : "تأكيد"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main modal (add / edit / renew / extend / history) ───────────── */}
      {open && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
          <div className="w-full sm:max-w-xl bg-[#0F172A] border border-white/10 rounded-t-2xl sm:rounded-2xl p-5 max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="font-semibold">
                {modalType === "add"     && "إضافة لاعب"}
                {modalType === "edit"    && "تعديل لاعب"}
                {modalType === "renew"   && "تجديد اشتراك"}
                {modalType === "extend"  && `تمديد اشتراك — ${players.find(p => p.id === activePlayerId)?.name ?? ""}`}
                {modalType === "history" && `سجل التسجيل — ${historyPlayerName}`}
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-white/70 hover:text-white"
                type="button"
              >
                ✕
              </button>
            </div>

            {/* Save error */}
            {saveError && (
              <div className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
                {saveError}
              </div>
            )}

            {/* ── Extend modal body (Feature B) ─────────────────────────── */}
            {modalType === "extend" && (() => {
              const activeP = players.find((x) => x.id === activePlayerId);
              const isSessionMode = activeP?.subscriptionMode === "حصص";
              const branch = activeP?.branchId ? branchMap.get(activeP.branchId) : undefined;
              const newEndISO = activeP && activeP.end && activeP.end !== "—"
                ? computeExtendEndISO(activeP.end, activeP.subscriptionMode, branch?.days ?? [], extendDays)
                : null;
              return (
                <div>
                  <div className="text-sm text-white/70 mb-4">
                    {isSessionMode
                      ? "أدخل عدد الحصص الإضافية التي تريد إضافتها إلى نهاية الاشتراك."
                      : "أدخل عدد الأيام التي تريد إضافتها إلى نهاية الاشتراك الحالي."}
                  </div>
                  <div className="mb-5">
                    <div className="text-xs text-white/70 mb-1">
                      {isSessionMode ? "عدد الحصص" : "عدد الأيام"}
                    </div>
                    <input
                      type="number"
                      min="1"
                      value={extendDays}
                      onChange={(e) => setExtendDays(Math.max(1, Number(e.target.value) || 1))}
                      className="w-full h-11 rounded-xl bg-[#0B1220] border border-white/10 px-4 text-white outline-none focus:border-white/25"
                    />
                  </div>
                  {activeP && activeP.end && activeP.end !== "—" && (
                    <div className="mb-5 text-xs text-white/60">
                      تاريخ الانتهاء الحالي:{" "}
                      <span className="text-white">{activeP.end}</span>
                      {newEndISO && (
                        <>
                          {" → "}
                          <span className="text-[#63C0B0]">{isoToDDMMYYYY(newEndISO)}</span>
                        </>
                      )}
                    </div>
                  )}
                  <div className="flex gap-3">
                    <Button variant="secondary" onClick={() => setOpen(false)}>إلغاء</Button>
                    <Button onClick={doExtend} disabled={saving}>
                      {saving ? "جاري الحفظ..." : "تمديد"}
                    </Button>
                  </div>
                </div>
              );
            })()}

            {/* ── History modal body (Feature F) ───────────────────────── */}
            {modalType === "history" && (
              <div>
                {historyLoading && (
                  <div className="space-y-2 py-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-12 rounded-xl" />
                    ))}
                  </div>
                )}
                {!historyLoading && historyEvents.length === 0 && (
                  <div className="py-8 text-center text-sm text-white/40">
                    لا يوجد سجل لهذا اللاعب.
                    <div className="mt-2 text-[11px] text-white/25">
                      لا توجد دفعات مسجلة لهذا اللاعب.
                    </div>
                  </div>
                )}
                {!historyLoading && historyEvents.length > 0 && (
                  <div className="space-y-2">
                    {historyEvents.map((ev) => {
                      const cfg = EVENT_CONFIG[ev.event_type] ?? {
                        label: ev.event_type,
                        color: "bg-white/10 text-white/60 border-white/15",
                      };
                      return (
                        <div
                          key={ev.id}
                          className="flex items-start gap-3 p-3 rounded-xl bg-white/3 border border-white/8"
                        >
                          <div className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${
                            ev.event_type === "extension" && (ev.extend_days ?? 0) < 0
                              ? "bg-orange-500/15 text-orange-300 border-orange-500/30"
                              : cfg.color
                          }`}>
                            {ev.event_type === "extension" && (ev.extend_days ?? 0) < 0
                              ? "عكس تمديد"
                              : cfg.label}
                            {ev.event_type === "extension" && ev.extend_days != null
                              ? ev.extend_days > 0
                                ? ` (+${ev.extend_days})`
                                : ` (${ev.extend_days})`
                              : ""}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-white/50">
                              {ev.event_date}
                            </div>
                            {ev.note && (
                              <div className="text-xs text-white/40 mt-0.5 truncate">
                                {ev.note}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="mt-4">
                  <Button variant="secondary" onClick={() => setOpen(false)}>إغلاق</Button>
                </div>
              </div>
            )}

            {/* ── Add / Edit / Renew modal body ────────────────────────── */}
            {(modalType === "add" || modalType === "edit" || modalType === "renew") && (
              <>
                {/* Quick actions — edit mode only (pause / extend) */}
                {modalType === "edit" && activePlayerId && (
                  <div className="mb-4 flex items-center gap-2 flex-wrap rounded-xl bg-white/[0.03] border border-white/[0.06] px-3 py-2.5">
                    <span className="text-xs text-white/35 ml-1">إجراءات سريعة:</span>
                    <button
                      type="button"
                      onClick={() => {
                        doTogglePause(activePlayerId);
                        setOpen(false);
                      }}
                      disabled={pauseToggling === activePlayerId}
                      className="h-7 px-3 rounded-lg text-xs border border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white transition disabled:opacity-40"
                    >
                      {players.find((p) => p.id === activePlayerId)?.isPaused ? "▶ استئناف الاشتراك" : "⏸ إيقاف مؤقت"}
                    </button>
                    <button
                      type="button"
                      onClick={() => openExtendModal(activePlayerId)}
                      className="h-7 px-3 rounded-lg text-xs border border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white transition"
                    >
                      ↔ تمديد الاشتراك
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Avatar upload */}
                  {(modalType === "add" || modalType === "edit") && (
                    <div className="col-span-full">
                      <div className="text-xs text-white/70 mb-2">صورة اللاعب (اختياري)</div>
                      <div className="flex items-center gap-4">
                        {/* Preview circle */}
                        <div className="shrink-0">
                          {avatarPreview ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={avatarPreview}
                              alt="معاينة"
                              className="h-14 w-14 rounded-full object-cover border border-white/15"
                            />
                          ) : (
                            <div className="h-14 w-14 rounded-full bg-[#00ff9c]/10 border border-[#00ff9c]/20 flex items-center justify-center text-xl font-bold text-[#00ff9c]">
                              {name.trim()[0] ?? "؟"}
                            </div>
                          )}
                        </div>
                        {/* File input */}
                        <label className="flex-1 cursor-pointer">
                          <div className="h-10 rounded-xl bg-[#0B1220] border border-white/10 border-dashed flex items-center justify-center text-xs text-white/50 hover:border-white/25 hover:text-white/70 transition px-3">
                            {avatarFile ? avatarFile.name : "اختر صورة..."}
                          </div>
                          <input
                            type="file"
                            accept="image/*"
                            className="sr-only"
                            onChange={(e) => {
                              const file = e.target.files?.[0] ?? null;
                              setAvatarFile(file);
                              if (file) {
                                const url = URL.createObjectURL(file);
                                setAvatarPreview(url);
                              }
                            }}
                          />
                        </label>
                        {/* Clear button */}
                        {(avatarFile || avatarPreview) && (
                          <button
                            type="button"
                            onClick={() => { setAvatarFile(null); setAvatarPreview(null); }}
                            className="text-xs text-white/40 hover:text-red-400 transition"
                            title="حذف الصورة"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Name */}
                  <div className="col-span-full">
                    <div className="text-xs text-white/70 mb-1">الاسم</div>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full h-11 rounded-xl bg-[#0B1220] border border-white/10 px-4 outline-none"
                      placeholder="اسم اللاعب"
                    />
                  </div>

                  {/* Birth */}
                  <div>
                    <div className="text-xs text-white/70 mb-1">سنة الميلاد</div>
                    <input
                      value={birth}
                      onChange={(e) => setBirth(e.target.value)}
                      className="w-full h-11 rounded-xl bg-[#0B1220] border border-white/10 px-4 outline-none"
                      placeholder="مثال: 2016"
                    />
                  </div>

                  {/* Phone */}
                  <div>
                    <div className="text-xs text-white/70 mb-1">هاتف ولي الأمر</div>
                    <input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full h-11 rounded-xl bg-[#0B1220] border border-white/10 px-4 outline-none"
                      placeholder="مثال: 99999999"
                    />
                  </div>

                  {/* Branch */}
                  <div className="col-span-full">
                    <div className="text-xs text-white/70 mb-1">الفرع</div>
                    <select
                      value={branchId}
                      onChange={(e) => applyBranchSettings(e.target.value)}
                      className="w-full h-11 rounded-xl bg-[#0B1220] border border-white/10 px-4 outline-none"
                      disabled={modalType === "renew"}
                    >
                      <option value="">اختر الفرع</option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Start Date */}
                  <div className="col-span-full">
                    <div className="text-xs text-white/70 mb-1">تاريخ البداية</div>
                    <input
                      type="text"
                      value={startDateText}
                      onChange={(e) => handleStartDateTextChange(e.target.value)}
                      placeholder="يوم/شهر/سنة  —  مثال: 26/02/2026"
                      maxLength={10}
                      className="w-full h-11 rounded-xl bg-[#0B1220] border border-white/10 px-4 outline-none"
                      dir="ltr"
                    />
                  </div>

                  {/* Subscription mode */}
                  <div className="col-span-full">
                    <div className="text-xs text-white/70 mb-1">نوع الاشتراك</div>
                    <div className="flex gap-2">
                      {(["حصص", "شهري"] as SubscriptionMode[]).map((m) => (
                        <button
                          key={m}
                          onClick={() => setSubscriptionMode(m)}
                          className={[
                            "h-10 px-4 rounded-xl text-sm border transition",
                            subscriptionMode === m
                              ? "bg-white/10 border-white/15"
                              : "bg-[#0B1220] border-white/10 hover:bg-white/5",
                          ].join(" ")}
                          type="button"
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Sessions */}
                  {subscriptionMode === "حصص" && (
                    <div>
                      <div className="text-xs text-white/70 mb-1">عدد الحصص</div>
                      <input
                        value={sessionsInput}
                        onChange={(e) => setSessionsInput(e.target.value)}
                        className="w-full h-11 rounded-xl bg-[#0B1220] border border-white/10 px-4 outline-none"
                        placeholder="مثال: 12"
                      />
                    </div>
                  )}

                  {/* Price */}
                  <div>
                    <div className="text-xs text-white/70 mb-1">السعر (د.ك)</div>
                    <input
                      value={priceInput}
                      onChange={(e) => setPriceInput(e.target.value)}
                      className="w-full h-11 rounded-xl bg-[#0B1220] border border-white/10 px-4 outline-none"
                      placeholder="مثال: 40"
                    />
                  </div>

                  {/* is_legacy */}
                  <div className="col-span-full">
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={isLegacy}
                        onChange={(e) => setIsLegacy(e.target.checked)}
                        className="h-4 w-4 rounded"
                      />
                      <span className="text-sm text-white/80">
                        لاعب قديم
                        <span className="text-white/40 text-xs mr-2">
                          (لا يُحتسب في تحليلات اللاعبين الجدد)
                        </span>
                      </span>
                    </label>
                  </div>

                  {/* End preview */}
                  <div className="col-span-full text-xs text-white/70">
                    تاريخ النهاية المتوقع:{" "}
                    <span className="text-white">{computeEndPreview()}</span>
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-between gap-3">
                  <Button variant="secondary" onClick={() => setOpen(false)}>
                    إلغاء
                  </Button>
                  <Button onClick={savePlayer} disabled={saving}>
                    {saving ? "جاري الحفظ..." : "حفظ"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
