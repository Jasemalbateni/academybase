"use client";

/**
 * usePlayersPage — all state, derived data, and operations for the Players page.
 * The page component imports this hook and renders only JSX.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type DbPlayer,
  listPlayers,
  createPlayer,
  updatePlayer,
  deletePlayer,
  pausePlayer,
  resumePlayer,
  uploadPlayerAvatar,
  deletePlayerAvatar,
} from "@/src/lib/supabase/players";
import {
  createPayment,
  updatePayment,
  listPlayerPayments,
  type DbPayment,
} from "@/src/lib/supabase/payments";
import {
  type DbBranch,
  listBranches,
} from "@/src/lib/supabase/branches";
import {
  createSubscriptionEvent,
  listSubscriptionEvents,
  type DbSubscriptionEvent,
  type SubscriptionEventType,
} from "@/src/lib/supabase/subscription-events";
import { getMembership } from "@/src/lib/supabase/roles";
import {
  formatError,
  isoToDDMMYYYY,
  ddmmyyyyToISO,
  isoToDate,
  ddmmyyyyToDate,
  dateToISO,
  addDays,
} from "@/src/lib/utils";
import type { Player, BranchLite, FilterKey, ModalType, SubscriptionMode } from "./_types";
import {
  dbToPlayer,
  dbToBranchLite,
  computeMonthlyEndISO,
  computeMonthlyEnd,
  computeSessionsEndISO,
  computeSessionsEnd,
  computeExtendEndISO,
  calcStatusFromEnd,
  findExistingPlayer,
  buildSyntheticHistory,
  printPlayers as printPlayersFn,
} from "./_utils";

export function usePlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [branches, setBranches] = useState<BranchLite[]>([]);

  // Permission: admin_staff is view-only; owner/partner/branch_manager can manage
  const [canManage, setCanManage] = useState(false);

  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Filters — initial values may be seeded from URL params (e.g. from dashboard or insights links)
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState<string>("all");

  // Pagination
  const [pageSize, setPageSize] = useState<30 | 50>(30);
  const [currentPage, setCurrentPage] = useState(1);

  // Modal
  const [open, setOpen] = useState(false);
  const [modalType, setModalType] = useState<ModalType>("add");
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);

  // Form fields
  const [name, setName] = useState("");
  const [birth, setBirth] = useState("");
  const [phone, setPhone] = useState("");
  const [branchId, setBranchId] = useState<string>("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [startDateText, setStartDateText] = useState(() =>
    isoToDDMMYYYY(new Date().toISOString().slice(0, 10))
  );
  const [subscriptionMode, setSubscriptionMode] = useState<SubscriptionMode>("حصص");
  const [sessionsInput, setSessionsInput] = useState<string>("12");
  const [priceInput, setPriceInput] = useState<string>("0");
  const [isLegacy, setIsLegacy] = useState(false);

  // Feature B: Extend
  const [extendDays, setExtendDays] = useState<number>(7);

  // Fix 6: Preserve extended end_date when editing (only recompute if sub params changed)
  const [originalEndDateISO, setOriginalEndDateISO] = useState<string | null>(null);
  const [originalSubParams, setOriginalSubParams] = useState<{
    startDate: string; mode: SubscriptionMode; branchId: string; sessions: number;
  } | null>(null);

  // Feature C: Pause toggle
  const [pauseToggling, setPauseToggling] = useState<string | null>(null);

  // Feature D: Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkExtendDays, setBulkExtendDays] = useState<number>(7);
  const [bulkConfirm, setBulkConfirm] = useState<"extend" | "delete" | "pause" | "transfer" | null>(null);
  const [bulkTransferBranchId, setBulkTransferBranchId] = useState<string>("");
  const [bulkProcessing, setBulkProcessing] = useState(false);

  // Feature F: History
  const [historyEvents, setHistoryEvents] = useState<DbSubscriptionEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPlayerName, setHistoryPlayerName] = useState<string>("");

  // Avatar upload
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  // ── Load on mount ────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    setPageError(null);
    try {
      const [dbPlayers, dbBranches, membership] = await Promise.all([
        listPlayers(),
        listBranches(),
        getMembership(),
      ]);
      setPlayers(dbPlayers.map(dbToPlayer));
      setBranches(dbBranches.map(dbToBranchLite));
      // admin_staff is view-only; owner/partner/branch_manager can manage players
      setCanManage(membership.role !== "admin_staff");
    } catch (e) {
      console.error("[players] load error:", e);
      setPageError(formatError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Seed filters from URL params on first mount ───────────────────────────
  // Allows links from dashboard/insights (e.g. /players?filter=ending7&search=NAME)
  // to land with the correct filter pre-applied.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const filterParam = params.get("filter");
    const searchParam = params.get("search");
    const validFilters: FilterKey[] = ["all", "active", "ending7", "expired"];
    if (filterParam && validFilters.includes(filterParam as FilterKey)) {
      setActiveFilter(filterParam as FilterKey);
    }
    if (searchParam) {
      setSearchTerm(searchParam);
      setDebouncedSearch(searchParam);
    }
  }, []); // intentionally only on mount — URL params are a navigation hint

  // Debounce search input — 300ms delay before filtering
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // ── Derived: branch map ──────────────────────────────────────────────────────
  const branchMap = useMemo(() => {
    const m = new Map<string, BranchLite>();
    branches.forEach((b) => m.set(b.id, b));
    return m;
  }, [branches]);

  // ── Apply branch settings to form ───────────────────────────────────────────
  function applyBranchSettings(
    newBranchId: string,
    opts?: { keepPrice?: boolean; keepSessions?: boolean }
  ) {
    setBranchId(newBranchId);
    const b = branchMap.get(newBranchId);
    if (!b) return;
    setSubscriptionMode(b.subscriptionMode ?? "حصص");
    if (!opts?.keepPrice) setPriceInput(String(b.price ?? 0));
    if ((b.subscriptionMode ?? "حصص") === "حصص") {
      if (!opts?.keepSessions) setSessionsInput("12");
    } else {
      setSessionsInput("0");
    }
  }

  function handleStartDateTextChange(text: string) {
    setStartDateText(text);
    if (text.length === 10 && /^\d{2}\/\d{2}\/\d{4}$/.test(text)) {
      const iso = ddmmyyyyToISO(text);
      if (iso) setStartDate(iso);
    }
  }

  function computeEndPreview(): string {
    if (!branchId) return "—";
    if (subscriptionMode === "شهري") return computeMonthlyEnd(startDate);
    const sb = branchMap.get(branchId);
    if (!sb) return "—";
    return computeSessionsEnd(startDate, sb.days ?? [], Number(sessionsInput));
  }

  // ── Print ────────────────────────────────────────────────────────────────────
  function printPlayers(list: Player[]) {
    printPlayersFn(list, branchFilter, branchMap);
  }

  // ── Modal openers ────────────────────────────────────────────────────────────
  function openAddModal() {
    setModalType("add");
    setActivePlayerId(null);
    setName("");
    setBirth("");
    setPhone("");
    setBranchId("");
    const todayIso = new Date().toISOString().slice(0, 10);
    setStartDate(todayIso);
    setStartDateText(isoToDDMMYYYY(todayIso));
    setSubscriptionMode("حصص");
    setSessionsInput("12");
    setPriceInput("0");
    setIsLegacy(false);
    setSaveError(null);
    setAvatarFile(null);
    setAvatarPreview(null);
    setOpen(true);
  }

  function openEditModal(playerId: string) {
    const p = players.find((x) => x.id === playerId);
    if (!p) return;
    setModalType("edit");
    setActivePlayerId(playerId);
    setName(p.name);
    setBirth(p.birth);
    setPhone(p.phone ?? "");
    setBranchId(p.branchId ?? "");
    const todayIso = new Date().toISOString().slice(0, 10);
    const editStartISO =
      p.start && p.start !== "—" ? ddmmyyyyToISO(p.start) : todayIso;
    setStartDate(editStartISO);
    setStartDateText(isoToDDMMYYYY(editStartISO));
    const editMode = p.subscriptionMode;
    const editSessions = editMode === "حصص" ? p.sessions : 0;
    setSubscriptionMode(editMode);
    setSessionsInput(String(editSessions));
    setPriceInput(String(p.price ?? 0));
    setIsLegacy(p.isLegacy);
    // Fix 6: snapshot sub params so we can detect if they change
    const currentEndISO = p.end && p.end !== "—" ? ddmmyyyyToISO(p.end) : null;
    setOriginalEndDateISO(currentEndISO);
    setOriginalSubParams({
      startDate: editStartISO,
      mode: editMode,
      branchId: p.branchId ?? "",
      sessions: editSessions,
    });
    setSaveError(null);
    setAvatarFile(null);
    setAvatarPreview(p.avatarUrl ?? null);
    setOpen(true);
  }

  function openRenewModal(playerId: string) {
    const p = players.find((x) => x.id === playerId);
    if (!p) return;
    setModalType("renew");
    setActivePlayerId(playerId);
    setName(p.name);
    setBirth(p.birth);
    setPhone(p.phone ?? "");
    setBranchId(p.branchId ?? "");
    const endDate = ddmmyyyyToDate(p.end);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let proposed = new Date(today);
    if (endDate) {
      const nextDay = addDays(endDate, 1);
      nextDay.setHours(0, 0, 0, 0);
      proposed = nextDay.getTime() > today.getTime() ? nextDay : today;
    }
    const renewISO = dateToISO(proposed);
    setStartDate(renewISO);
    setStartDateText(isoToDDMMYYYY(renewISO));
    const b = p.branchId ? branchMap.get(p.branchId) : undefined;
    const mode: SubscriptionMode = b?.subscriptionMode ?? p.subscriptionMode ?? "حصص";
    setSubscriptionMode(mode);
    setSessionsInput(mode === "حصص" ? "12" : "0");
    setPriceInput(String(b?.price ?? p.price ?? 0));
    setIsLegacy(p.isLegacy);
    setSaveError(null);
    setOpen(true);
  }

  // Feature B: Extend modal
  function openExtendModal(playerId: string) {
    setModalType("extend");
    setActivePlayerId(playerId);
    setExtendDays(7);
    setSaveError(null);
    setOpen(true);
  }

  // Feature F: History modal — Fix 2: fallback to payments-based synthetic history
  async function openHistoryModal(playerId: string) {
    const p = players.find((x) => x.id === playerId);
    setModalType("history");
    setActivePlayerId(playerId);
    setHistoryPlayerName(p?.name ?? "");
    setHistoryEvents([]);
    setHistoryLoading(true);
    setSaveError(null);
    setOpen(true);
    try {
      const [events, pmts] = await Promise.all([
        listSubscriptionEvents(playerId),
        listPlayerPayments(playerId).catch(() => [] as DbPayment[]),
      ]);

      if (events.length > 0) {
        // Inject synthetic "expired" events from payment gaps into the real event list
        const syntheticExpired: DbSubscriptionEvent[] = [];
        const sortedPmts = [...pmts].sort((a, b) => a.date.localeCompare(b.date));
        for (let i = 0; i < sortedPmts.length - 1; i++) {
          const cur = sortedPmts[i];
          const next = sortedPmts[i + 1];
          if (cur.subscription_end && next) {
            const endDate = isoToDate(cur.subscription_end);
            const nextStart = isoToDate(next.date);
            endDate.setHours(0, 0, 0, 0);
            nextStart.setHours(0, 0, 0, 0);
            const gapDays = Math.round((nextStart.getTime() - endDate.getTime()) / (1000 * 60 * 60 * 24));
            if (gapDays > 1) {
              // Only add if not already present
              const alreadyExists = events.some(
                (ev) => ev.event_type === "expired" && ev.event_date === cur.subscription_end
              );
              if (!alreadyExists) {
                syntheticExpired.push({
                  id: `synth-${cur.id}-expired`,
                  academy_id: "",
                  player_id: playerId,
                  event_type: "expired",
                  event_date: cur.subscription_end,
                  extend_days: null,
                  payment_id: null,
                  note: null,
                  created_by: null,
                  created_at: cur.created_at,
                });
              }
            }
          }
        }
        // Also check if the last payment's subscription has already expired with no renewal
        const lastPmt = sortedPmts[sortedPmts.length - 1];
        const todayStr = new Date().toISOString().slice(0, 10);
        if (lastPmt?.subscription_end && lastPmt.subscription_end < todayStr) {
          const alreadyHasFinalExpired = [...events, ...syntheticExpired].some(
            (ev) => ev.event_type === "expired" && ev.event_date >= lastPmt.subscription_end!
          );
          if (!alreadyHasFinalExpired) {
            syntheticExpired.push({
              id: `synth-${lastPmt.id}-expired-final`,
              academy_id: "",
              player_id: playerId,
              event_type: "expired",
              event_date: lastPmt.subscription_end,
              extend_days: null,
              payment_id: null,
              note: null,
              created_by: null,
              created_at: lastPmt.created_at,
            });
          }
        }

        const merged = [...events, ...syntheticExpired].sort((a, b) =>
          a.event_date.localeCompare(b.event_date)
        );
        setHistoryEvents(merged);
      } else {
        // No events yet (table new or player predates feature) — derive from payments
        setHistoryEvents(buildSyntheticHistory(pmts));
      }
    } catch (e) {
      console.error("[players] history load error:", e);
    } finally {
      setHistoryLoading(false);
    }
  }

  // ── Save (add / edit / renew) ────────────────────────────────────────────────
  async function savePlayer() {
    setSaveError(null);

    if (!name.trim() || !birth.trim() || !branchId) {
      setSaveError("يرجى تعبئة الاسم + سنة الميلاد + الفرع.");
      return;
    }
    if (phone && !/^[0-9+ ]{6,20}$/.test(phone)) {
      setSaveError("رقم الهاتف غير صحيح.");
      return;
    }
    const b = branchMap.get(branchId);
    if (!b) {
      setSaveError("الفرع غير موجود.");
      return;
    }
    const price = Number(priceInput);
    if (!Number.isFinite(price) || price <= 0) {
      setSaveError("سعر الاشتراك غير صحيح.");
      return;
    }

    let sessions = 0;
    let endDateISO: string | null = null;

    if (subscriptionMode === "شهري") {
      sessions = 0;
      endDateISO = computeMonthlyEndISO(startDate);
    } else {
      const s = Number(sessionsInput);
      if (!Number.isFinite(s) || s <= 0) {
        setSaveError("عدد الحصص غير صحيح.");
        return;
      }
      sessions = s;
      if (!b.days || b.days.length === 0) {
        setSaveError("أيام الفرع غير محددة. عدل الفرع وحدد أيام التدريب.");
        return;
      }
      endDateISO = computeSessionsEndISO(startDate, b.days, sessions);
      if (!endDateISO) {
        setSaveError("تعذر حساب تاريخ النهاية.");
        return;
      }
    }

    // Fix 6: in edit mode, preserve the existing end_date unless subscription params changed.
    // This prevents overwriting an extended end_date when only name/phone/price is edited.
    if (modalType === "edit" && originalSubParams && originalEndDateISO) {
      const unchanged =
        originalSubParams.startDate === startDate &&
        originalSubParams.mode === subscriptionMode &&
        originalSubParams.branchId === branchId &&
        originalSubParams.sessions === sessions;
      if (unchanged) {
        endDateISO = originalEndDateISO;
      }
    }

    setSaving(true);
    try {
      if (modalType === "add") {
        const existing = findExistingPlayer(players, { name: name.trim(), birth: birth.trim() });
        if (existing) {
          setSaveError(
            `هذا اللاعب موجود مسبقًا بنفس الاسم وسنة الميلاد: ${existing.name}`
          );
          setSaving(false);
          return;
        }

        const dbPlayer = await createPlayer({
          branch_id: branchId || null,
          name: name.trim(),
          birth: birth.trim(),
          phone: phone.trim(),
          subscription_mode: subscriptionMode,
          sessions,
          price,
          start_date: startDate,
          end_date: endDateISO,
          is_legacy: isLegacy,
        });

        // Upload avatar if selected (non-critical: player is already created)
        if (avatarFile) {
          try {
            const url = await uploadPlayerAvatar(avatarFile, dbPlayer.academy_id, dbPlayer.id);
            await updatePlayer(dbPlayer.id, { avatar_url: url });
            dbPlayer.avatar_url = url;
          } catch (avatarErr) {
            console.error("[players] avatar upload failed:", avatarErr);
          }
        }

        const payment = await createPayment({
          branch_id:        branchId || null,
          player_id:        dbPlayer.id,
          amount:           price,
          kind:             isLegacy ? "legacy" : "new",
          date:             startDate,
          subscription_end: endDateISO,
        });

        // Feature F: create subscription event (best-effort)
        try {
          await createSubscriptionEvent({
            player_id:  dbPlayer.id,
            event_type: "first_registration",
            event_date: startDate,
            payment_id: (payment as DbPayment).id,
          });
        } catch { /* non-critical */ }

        setPlayers((prev) => [dbToPlayer(dbPlayer), ...prev]);
        setOpen(false);
        return;
      }

      if (!activePlayerId) return;

      // Handle avatar changes in edit mode
      const originalPlayer = players.find((p) => p.id === activePlayerId);
      let newAvatarUrl: string | null | undefined = undefined;
      if (avatarFile) {
        // New file selected → upload
        try {
          newAvatarUrl = await uploadPlayerAvatar(avatarFile, originalPlayer!.academy_id, activePlayerId);
        } catch (avatarErr) {
          console.error("[players] avatar upload failed:", avatarErr);
        }
      } else if (avatarPreview === null && originalPlayer?.avatarUrl) {
        // Avatar was cleared → remove from storage and set to null
        deletePlayerAvatar(originalPlayer.avatarUrl).catch(() => {});
        newAvatarUrl = null;
      }

      const dbPlayer = await updatePlayer(activePlayerId, {
        branch_id: branchId || null,
        name: name.trim(),
        birth: birth.trim(),
        phone: phone.trim(),
        subscription_mode: subscriptionMode,
        sessions,
        price,
        start_date: startDate,
        end_date: endDateISO,
        is_legacy: isLegacy,
        ...(newAvatarUrl !== undefined ? { avatar_url: newAvatarUrl } : {}),
      });

      setPlayers((prev) =>
        prev.map((p) => (p.id === activePlayerId ? dbToPlayer(dbPlayer) : p))
      );

      // Fix 1: update latest payment amount when price changes (edit mode only)
      if (modalType === "edit") {
        if (originalPlayer && price !== originalPlayer.price) {
          try {
            const pmts = await listPlayerPayments(activePlayerId);
            if (pmts.length > 0) await updatePayment(pmts[0].id, { amount: price });
          } catch { /* non-critical — Finance page re-syncs on next visit */ }
        }
      }

      if (modalType === "renew") {
        const payment = await createPayment({
          branch_id:        branchId || null,
          player_id:        activePlayerId,
          amount:           price,
          kind:             "renew",
          date:             startDate,
          subscription_end: endDateISO,
        });

        // Feature F: always record as "renewal" (no "returned" concept)
        try {
          await createSubscriptionEvent({
            player_id:  activePlayerId,
            event_type: "renewal",
            event_date: startDate,
            payment_id: (payment as DbPayment).id,
          });
        } catch { /* non-critical */ }
      }

      setOpen(false);
    } catch (e) {
      console.error("[players] save error:", e);
      setSaveError(formatError(e));
    } finally {
      setSaving(false);
    }
  }

  // Feature B: do extend (single player) — Fix 3: session-based + Fix 4b: note with new end_date
  async function doExtend() {
    if (!activePlayerId || extendDays < 1) return;
    const p = players.find((x) => x.id === activePlayerId);
    if (!p) return;
    if (!p.end || p.end === "—") {
      setSaveError("لا يوجد تاريخ انتهاء للتمديد.");
      return;
    }
    const branch = p.branchId ? branchMap.get(p.branchId) : undefined;
    const newEndISO = computeExtendEndISO(p.end, p.subscriptionMode, branch?.days ?? [], extendDays);
    if (!newEndISO) {
      setSaveError("تعذر حساب تاريخ التمديد. تأكد من إعداد أيام الفرع.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      // For حصص mode: also increment sessions by the number of added training sessions
      // so that remainingSessions() stays accurate after the extension.
      // For شهري mode: extendDays are calendar days — sessions field is not used.
      const sessionUpdate =
        p.subscriptionMode === "حصص"
          ? { end_date: newEndISO, sessions: (p.sessions ?? 0) + extendDays }
          : { end_date: newEndISO };
      const updated = await updatePlayer(activePlayerId, sessionUpdate);
      try {
        await createSubscriptionEvent({
          player_id:   activePlayerId,
          event_type:  "extension",
          event_date:  new Date().toISOString().slice(0, 10),
          extend_days: extendDays,
          note:        `ينتهي في: ${isoToDDMMYYYY(newEndISO)}`,
        });
      } catch { /* non-critical */ }
      setPlayers((prev) =>
        prev.map((x) => (x.id === activePlayerId ? dbToPlayer(updated) : x))
      );
      setOpen(false);
    } catch (e) {
      setSaveError(formatError(e));
    } finally {
      setSaving(false);
    }
  }

  // Feature C: pause / resume
  async function doTogglePause(playerId: string) {
    const p = players.find((x) => x.id === playerId);
    if (!p) return;
    setPauseToggling(playerId);
    try {
      const updated = p.isPaused
        ? await resumePlayer(playerId)
        : await pausePlayer(playerId);
      const eventType: SubscriptionEventType = p.isPaused ? "resumed" : "paused";
      try {
        await createSubscriptionEvent({
          player_id:  playerId,
          event_type: eventType,
          event_date: new Date().toISOString().slice(0, 10),
        });
      } catch { /* non-critical */ }
      setPlayers((prev) =>
        prev.map((x) => (x.id === playerId ? dbToPlayer(updated) : x))
      );
    } catch (e) {
      console.error("[players] pause toggle error:", e);
      alert(formatError(e));
    } finally {
      setPauseToggling(null);
    }
  }

  // Feature D: bulk extend — Fix 3: session-based per player
  async function doBulkExtend() {
    const ids = Array.from(selectedIds);
    setBulkProcessing(true);
    setBulkConfirm(null);
    const today = new Date().toISOString().slice(0, 10);
    try {
      for (const id of ids) {
        const p = players.find((x) => x.id === id);
        if (!p || !p.end || p.end === "—") continue;
        const branch = p.branchId ? branchMap.get(p.branchId) : undefined;
        const newEndISO = computeExtendEndISO(p.end, p.subscriptionMode, branch?.days ?? [], bulkExtendDays);
        if (!newEndISO) continue;
        // For حصص mode: also increment sessions so remainingSessions() stays accurate.
        const bulkUpdate =
          p.subscriptionMode === "حصص"
            ? { end_date: newEndISO, sessions: (p.sessions ?? 0) + bulkExtendDays }
            : { end_date: newEndISO };
        const updated = await updatePlayer(id, bulkUpdate);
        try {
          await createSubscriptionEvent({
            player_id:   id,
            event_type:  "extension",
            event_date:  today,
            extend_days: bulkExtendDays,
            note:        `ينتهي في: ${isoToDDMMYYYY(newEndISO)}`,
          });
        } catch { /* non-critical */ }
        setPlayers((prev) =>
          prev.map((x) => (x.id === id ? dbToPlayer(updated) : x))
        );
      }
      setSelectedIds(new Set());
    } catch (e) {
      console.error("[players] bulk extend error:", e);
      alert(formatError(e));
    } finally {
      setBulkProcessing(false);
    }
  }

  // Feature D: bulk pause (toggle to paused)
  async function doBulkPause() {
    const ids = Array.from(selectedIds);
    setBulkProcessing(true);
    setBulkConfirm(null);
    try {
      for (const id of ids) {
        const updated = await pausePlayer(id);
        setPlayers((prev) => prev.map((x) => (x.id === id ? dbToPlayer(updated) : x)));
      }
      setSelectedIds(new Set());
    } catch (e) {
      console.error("[players] bulk pause error:", e);
      alert(formatError(e));
    } finally {
      setBulkProcessing(false);
    }
  }

  // Feature D: bulk transfer to another branch
  async function doBulkTransfer() {
    if (!bulkTransferBranchId) return;
    const ids = Array.from(selectedIds);
    setBulkProcessing(true);
    setBulkConfirm(null);
    try {
      for (const id of ids) {
        const updated = await updatePlayer(id, { branch_id: bulkTransferBranchId });
        setPlayers((prev) => prev.map((x) => (x.id === id ? dbToPlayer(updated) : x)));
      }
      setSelectedIds(new Set());
    } catch (e) {
      console.error("[players] bulk transfer error:", e);
      alert(formatError(e));
    } finally {
      setBulkProcessing(false);
    }
  }

  // Feature D: bulk delete
  async function doBulkDelete() {
    const ids = Array.from(selectedIds);
    setBulkProcessing(true);
    setBulkConfirm(null);
    try {
      for (const id of ids) {
        await deletePlayer(id);
        setPlayers((prev) => prev.filter((p) => p.id !== id));
      }
      setSelectedIds(new Set());
    } catch (e) {
      console.error("[players] bulk delete error:", e);
      alert(formatError(e));
    } finally {
      setBulkProcessing(false);
    }
  }

  // ── Filters + pagination ─────────────────────────────────────────────────────
  const filteredPlayers = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return players
      .filter((p) => {
        if (!q) return true;
        return (
          (p.name ?? "").toLowerCase().includes(q) ||
          (p.phone ?? "").toLowerCase().includes(q)
        );
      })
      .filter((p) => {
        const liveStatus = calcStatusFromEnd(p.end, p.isPaused);
        if (activeFilter === "all") return true;
        if (activeFilter === "active") return liveStatus === "نشط";
        if (activeFilter === "ending7") return liveStatus === "قريب";
        if (activeFilter === "expired") return liveStatus === "منتهي";
        return true;
      })
      .filter((p) => {
        if (branchFilter === "all") return true;
        return p.branchId === branchFilter;
      });
  }, [players, debouncedSearch, activeFilter, branchFilter]);

  // Reset to page 1 whenever filters or page size change
  useEffect(() => { setCurrentPage(1); }, [debouncedSearch, activeFilter, branchFilter, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredPlayers.length / pageSize));
  const paginatedPlayers = useMemo(
    () => filteredPlayers.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filteredPlayers, currentPage, pageSize]
  );

  // Select all filtered
  const allFilteredSelected =
    filteredPlayers.length > 0 &&
    filteredPlayers.every((p) => selectedIds.has(p.id));

  function toggleSelectAll() {
    if (allFilteredSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredPlayers.forEach((p) => next.delete(p.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredPlayers.forEach((p) => next.add(p.id));
        return next;
      });
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return {
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
  };
}
