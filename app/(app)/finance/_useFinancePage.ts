"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type DbFinanceTx,
  listFinanceTx,
  createFinanceTx,
  upsertAutoFinanceTx,
  updateFinanceTx,
  deleteFinanceTx,
} from "@/src/lib/supabase/finance";
import {
  type DbBranch,
  listBranches,
} from "@/src/lib/supabase/branches";
import {
  type DbStaff,
  listStaff,
} from "@/src/lib/supabase/staff";
import {
  type DbPayment,
  listPayments,
} from "@/src/lib/supabase/payments";
import {
  listStaffAttendance,
  type DbStaffAttendance,
  countSessionsInMonth,
  ATTENDANCE_STATUS_LABELS,
} from "@/src/lib/supabase/staff-attendance";
import {
  listSessions,
  type DbSession,
} from "@/src/lib/supabase/sessions";
import {
  listPlayers,
  type DbPlayer,
} from "@/src/lib/supabase/players";
import { getMembership } from "@/src/lib/supabase/roles";
import { formatError } from "@/src/lib/utils";
import {
  todayISO,
  monthKey,
  prevMonthKey,
  dbToTx,
  dbToStaffLite,
  dbToPayment,
  branchNameFromList,
  exportCSV as exportCSVFn,
  printFinanceReport,
} from "./_utils";
import type {
  FinanceTx,
  BranchLite,
  StaffLite,
  Payment,
  GroupedTxView,
  SubItem,
  SortKey,
  Category,
  TxType,
  PrintMode,
} from "./_types";

export function useFinancePage() {
  const [branches, setBranches] = useState<BranchLite[]>([]);
  const [staff, setStaff] = useState<StaffLite[]>([]);
  const [tx, setTx] = useState<FinanceTx[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [staffAttendance, setStaffAttendance] = useState<DbStaffAttendance[]>([]);
  const [sessions,        setSessions]        = useState<DbSession[]>([]);
  const [players,         setPlayers]         = useState<{ id: string; name: string }[]>([]);
  const [expandedTxIds,   setExpandedTxIds]   = useState<Set<string>>(new Set());

  const [hasFinanceAccess, setHasFinanceAccess] = useState(false);

  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [autoSyncing, setAutoSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [printOpen, setPrintOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  // filters
  const [selectedBranch, setSelectedBranch] = useState<string>("all");
  const [selectedMonth, setSelectedMonth] = useState<string>(monthKey(todayISO()));

  // advanced filters
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<TxType | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<Category | "all">("all");
  const [sourceFilter, setSourceFilter] = useState<"auto" | "manual" | "all">("all");
  const [sort, setSort] = useState<SortKey>("date_desc");

  // Pagination
  const [finPageSize, setFinPageSize] = useState<30 | 50>(30);
  const [finPage, setFinPage] = useState(1);

  // modal
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  // form
  const [type, setType] = useState<TxType>("مصروف");
  const [branchId, setBranchId] = useState<string>("all");
  const [category, setCategory] = useState<Category>("أدوات");
  const [amount, setAmount] = useState<number>(0);
  const [dateISO, setDateISO] = useState<string>(todayISO());
  const [note, setNote] = useState<string>("");

  // Track last auto-sync key to avoid redundant runs
  const lastAutoSyncRef = useRef<string>("");
  // Always-current ref to tx — lets the auto-sync read latest tx without adding
  // tx to the dependency array (which would cause infinite re-run loops).
  const txRef = useRef<FinanceTx[]>([]);
  useEffect(() => { txRef.current = tx; }, [tx]);

  // ── Initial load ────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    setPageError(null);
    try {
      const [dbBranches, dbStaff, dbTx, dbPayments, dbPlayers, membership] = await Promise.all([
        listBranches(),
        listStaff(),
        listFinanceTx(),
        listPayments(),
        listPlayers(),
        getMembership(),
      ]);
      setHasFinanceAccess(membership.hasFinanceAccess);
      setBranches(
        dbBranches.map((b: DbBranch) => ({
          id: b.id,
          name: b.name,
          rent_type: b.rent_type,
          monthly_rent: Number(b.monthly_rent) || 0,
          days: b.days ?? [],
        }))
      );
      setStaff(dbStaff.map(dbToStaffLite));
      setTx(dbTx.map(dbToTx));
      setPayments(dbPayments.map(dbToPayment));
      setPlayers(dbPlayers.map((p: DbPlayer) => ({ id: p.id, name: p.name })));
    } catch (e) {
      console.error("[finance] load error:", e);
      setPageError(formatError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Staff attendance for selected month (used to compute net salary) ─────────
  useEffect(() => {
    let cancelled = false;
    listStaffAttendance(selectedMonth)
      .then((rows) => { if (!cancelled) setStaffAttendance(rows); })
      .catch(() => { if (!cancelled) setStaffAttendance([]); });
    return () => { cancelled = true; };
  }, [selectedMonth]);

  // ── Sessions for selected month (used to compute per_session rent) ───────────
  useEffect(() => {
    let cancelled = false;
    const [y, m] = selectedMonth.split("-").map(Number);
    const lastDay  = new Date(y, m, 0).getDate();
    const fromDate = `${selectedMonth}-01`;
    const toDate   = `${selectedMonth}-${String(lastDay).padStart(2, "0")}`;
    listSessions(fromDate, toDate)
      .then((rows) => { if (!cancelled) setSessions(rows); })
      .catch(() => { if (!cancelled) setSessions([]); });
    return () => { cancelled = true; };
  }, [selectedMonth]);

  // ── Payment amount helper ───────────────────────────────────────────────────
  // Always use the actual stored payment amount. This preserves accurate
  // historical revenue: if a player's price changed after a payment was recorded,
  // the historical month still shows what was actually paid.
  function paymentAmount(p: Payment): number {
    return Number(p.amount) || 0;
  }

  const playerMap = useMemo(
    () => new Map(players.map((p) => [p.id, p.name])),
    [players]
  );

  // ── Auto-generation sync ────────────────────────────────────────────────────
  useEffect(() => {
    if (loading || !branches.length) return;

    const suppressedInMonth = txRef.current
      .filter((t) => t.month === selectedMonth && t.source === "suppressed" && t.autoKey)
      .map((t) => t.autoKey!)
      .sort()
      .join(",");

    const rentSum = branches.map((b) => `${b.id}=${b.rent_type}:${b.monthly_rent}`).join(",");
    const deductionSummary = staffAttendance
      .filter((r) => r.deduct_from_salary && r.deduction_amount > 0)
      .map((r) => `${r.staff_id}:${r.branch_id}:${r.deduction_amount}`)
      .sort()
      .join(",");
    const sessionsSummary = sessions
      .filter((s) => s.status === "cancelled")
      .map((s) => `${s.branch_id}:${s.date}:${s.field_cost}`)
      .sort()
      .join(",");
    const syncKey = `${selectedMonth}:${branches.length}:${staff.length}:${payments.length}:${suppressedInMonth}:${rentSum}:${deductionSummary}:${sessionsSummary}`;
    if (syncKey === lastAutoSyncRef.current) return;

    let cancelled = false;

    const sync = async () => {
      setAutoSyncing(true);
      try {
        const currentTx = txRef.current;
        const monthExisting = currentTx.filter((t) => t.month === selectedMonth);

        const existingByAutoKey = new Map<string, FinanceTx>(
          monthExisting
            .filter((t) => t.autoKey)
            .map((t) => [t.autoKey!, t])
        );
        const overriddenKeys = new Set(
          monthExisting
            .filter((t) => t.overriddenAutoKey)
            .map((t) => t.overriddenAutoKey!)
        );
        const suppressedKeys = new Set(
          monthExisting
            .filter((t) => t.source === "suppressed" && t.autoKey)
            .map((t) => t.autoKey!)
        );

        const upsertOps: Promise<DbFinanceTx>[] = [];
        const deleteIds: string[] = [];

        // ── Cleanup: remove legacy sa: deduction entries (old approach) ────
        for (const t of monthExisting) {
          if (t.autoKey?.startsWith("sa:") && t.source === "auto") {
            deleteIds.push(t.id);
          }
        }

        // ── Build deduction map: "staffId:branchId" → total deductions ─────
        const deductionMap = new Map<string, number>();
        for (const row of staffAttendance) {
          if (!row.deduct_from_salary || row.deduction_amount <= 0) continue;
          const k = `${row.staff_id}:${row.branch_id}`;
          deductionMap.set(k, (deductionMap.get(k) ?? 0) + Number(row.deduction_amount));
        }

        // ── 1) Salaries per active staff member per branch ─────────────────
        for (const m of staff.filter((x) => x.isActive)) {
          const ids = m.branchIds || [];
          if (!ids.length) continue;
          const share = Math.round(((m.monthlySalary || 0) / ids.length) * 100) / 100;
          if (!Number.isFinite(share) || share <= 0) continue;

          for (const bid of ids) {
            const autoKey = `salary:${selectedMonth}:${m.id}:${bid}`;
            if (suppressedKeys.has(autoKey)) continue;
            if (overriddenKeys.has(autoKey)) continue;

            const deductionForBranch = deductionMap.get(`${m.id}:${bid}`) ?? 0;
            const netShare = Math.max(0, Math.round((share - deductionForBranch) * 100) / 100);

            const bName = branches.find((b) => b.id === bid)?.name ?? "—";
            const baseNote = `${m.name} — ${m.role}${
              m.role === "موظف" && m.jobTitle ? ` (${m.jobTitle})` : ""
            } — ${bName}`;
            const noteText = deductionForBranch > 0
              ? `${baseNote} (خصومات: ${deductionForBranch} د.ك)`
              : baseNote;

            const existing = existingByAutoKey.get(autoKey);
            if (existing) {
              if (existing.source === "suppressed") continue;
              if (existing.amount !== netShare || existing.note !== noteText) {
                upsertOps.push(
                  upsertAutoFinanceTx({
                    month: selectedMonth,
                    date: `${selectedMonth}-01`,
                    type: "مصروف",
                    branch_id: bid,
                    category: "رواتب",
                    amount: netShare,
                    note: noteText,
                    source: "auto",
                    auto_key: autoKey,
                  })
                );
              }
            } else {
              upsertOps.push(
                upsertAutoFinanceTx({
                  month: selectedMonth,
                  date: `${selectedMonth}-01`,
                  type: "مصروف",
                  branch_id: bid,
                  category: "رواتب",
                  amount: netShare,
                  note: noteText,
                  source: "auto",
                  auto_key: autoKey,
                })
              );
            }
          }
        }

        // ── 2) Subscription revenue per branch ────────────────────────────
        const monthPayments = payments.filter(
          (p) => p.dateISO.slice(0, 7) === selectedMonth
        );

        for (const b of branches) {
          const autoKey = `rev:${selectedMonth}:${b.id}`;
          if (suppressedKeys.has(autoKey)) continue;

          const list = monthPayments.filter((p) => p.branchId === b.id);
          const sum = list.reduce((s, p) => s + paymentAmount(p), 0);
          const newCount = list.filter((x) => x.kind === "new").length;
          const renewCount = list.filter((x) => x.kind === "renew").length;
          const noteText = `إيرادات اشتراكات اللاعبين — جديد: ${newCount} | تجديد: ${renewCount}`;

          const existing =
            existingByAutoKey.get(autoKey) ??
            monthExisting.find((t) => t.overriddenAutoKey === autoKey);

          if (!Number.isFinite(sum) || sum <= 0) {
            if (existing?.autoKey === autoKey && existing.source === "auto") {
              deleteIds.push(existing.id);
            }
            continue;
          }

          if (existing) {
            if (existing.source === "suppressed") continue;
            if (existing.amount !== sum || existing.note !== noteText) {
              if (existing.autoKey === autoKey || existing.overriddenAutoKey === autoKey) {
                upsertOps.push(
                  upsertAutoFinanceTx({
                    month: selectedMonth,
                    date: `${selectedMonth}-01`,
                    type: "إيراد",
                    branch_id: b.id,
                    category: "اشتراكات",
                    amount: Math.round(sum * 100) / 100,
                    note: noteText,
                    source: "auto",
                    auto_key: autoKey,
                  })
                );
              }
            }
          } else if (!overriddenKeys.has(autoKey)) {
            upsertOps.push(
              upsertAutoFinanceTx({
                month: selectedMonth,
                date: `${selectedMonth}-01`,
                type: "إيراد",
                branch_id: b.id,
                category: "اشتراكات",
                amount: Math.round(sum * 100) / 100,
                note: noteText,
                source: "auto",
                auto_key: autoKey,
              })
            );
          }
        }

        // ── 3) Field rent per branch (fixed_monthly + per_session) ───────────
        const [rentYear, rentMonthNum] = selectedMonth.split("-").map(Number);

        for (const b of branches) {
          const autoKey    = `rent:${selectedMonth}:${b.id}`;
          const isFixed    = b.rent_type === "fixed_monthly";
          const isPerSess  = b.rent_type === "per_session";
          const rent       = b.monthly_rent;
          const existing   = existingByAutoKey.get(autoKey);

          if ((!isFixed && !isPerSess) || rent <= 0) {
            if (existing?.autoKey === autoKey && existing.source === "auto") {
              deleteIds.push(existing.id);
            }
            continue;
          }

          if (suppressedKeys.has(autoKey)) continue;
          if (overriddenKeys.has(autoKey)) continue;

          let amount:   number;
          let noteText: string;

          if (isFixed) {
            amount   = rent;
            noteText = `إيجار ملعب شهري — ${b.name}`;
          } else {
            const scheduled = countSessionsInMonth(rentYear, rentMonthNum, b.days);
            if (scheduled <= 0) {
              if (existing?.autoKey === autoKey && existing.source === "auto") {
                deleteIds.push(existing.id);
              }
              continue;
            }
            const cancelledCount = sessions.filter(
              (s) =>
                s.branch_id === b.id &&
                s.date.slice(0, 7) === selectedMonth &&
                s.status === "cancelled" &&
                txRef.current.some(
                  (t) =>
                    t.autoKey === `session-field:${s.branch_id}:${s.date}` &&
                    t.source !== "suppressed"
                )
            ).length;
            const actual = Math.max(0, scheduled - cancelledCount);
            amount       = Math.round(actual * rent * 100) / 100;
            noteText     = `إيجار ملعب بالحصة — ${b.name} (${actual}/${scheduled} حصص × ${rent} د.ك)`;
          }

          if (amount <= 0) {
            if (existing?.autoKey === autoKey && existing.source === "auto") {
              deleteIds.push(existing.id);
            }
            continue;
          }

          if (existing) {
            if (existing.source === "suppressed") continue;
            if (existing.amount !== amount || existing.note !== noteText) {
              upsertOps.push(
                upsertAutoFinanceTx({
                  month: selectedMonth,
                  date: `${selectedMonth}-01`,
                  type: "مصروف",
                  branch_id: b.id,
                  category: "حجز ملعب",
                  amount,
                  note: noteText,
                  source: "auto",
                  auto_key: autoKey,
                })
              );
            }
          } else {
            upsertOps.push(
              upsertAutoFinanceTx({
                month: selectedMonth,
                date: `${selectedMonth}-01`,
                type: "مصروف",
                branch_id: b.id,
                category: "حجز ملعب",
                amount,
                note: noteText,
                source: "auto",
                auto_key: autoKey,
              })
            );
          }
        }

        if (cancelled) return;

        const hasWork = upsertOps.length > 0 || deleteIds.length > 0;
        if (hasWork) {
          await Promise.all([
            ...upsertOps,
            ...deleteIds.map((id) => deleteFinanceTx(id)),
          ]);
          if (cancelled) return;
          // Refresh both tx and staffAttendance together so the next auto-sync
          // does not compute salary deductions from stale state.
          const [updated, freshAttendance] = await Promise.all([
            listFinanceTx(),
            listStaffAttendance(selectedMonth),
          ]);
          if (!cancelled) {
            setTx(updated.map(dbToTx));
            setStaffAttendance(freshAttendance);
          }
        }

        lastAutoSyncRef.current = syncKey;
      } catch (e) {
        console.error("[finance] auto-sync error:", e);
      } finally {
        if (!cancelled) setAutoSyncing(false);
      }
    };

    sync();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth, branches, staff, payments, staffAttendance, sessions, loading]);

  // ── Branch name helper ──────────────────────────────────────────────────────
  function branchName(id: string) {
    return branchNameFromList(branches, id);
  }

  function toggleExpand(id: string) {
    setExpandedTxIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // ── Month view (suppressed entries are hidden from all UI) ──────────────────
  const monthTx = useMemo(
    () =>
      tx
        .filter((t) => t.source !== "suppressed")
        .filter((t) => t.month === selectedMonth)
        .filter((t) => {
          if (selectedBranch === "all") return true;
          return t.branchId === selectedBranch || t.branchId === "all";
        }),
    [tx, selectedMonth, selectedBranch]
  );

  // ── Advanced filter + sort ──────────────────────────────────────────────────
  const visibleTx = useMemo(() => {
    const query = q.trim().toLowerCase();
    let list = monthTx;
    if (typeFilter !== "all")     list = list.filter((t) => t.type === typeFilter);
    if (sourceFilter !== "all")   list = list.filter((t) => t.source === sourceFilter);
    if (categoryFilter !== "all") list = list.filter((t) => t.category === categoryFilter);
    if (query) {
      list = list.filter((t) => {
        const hay = [
          t.dateISO, t.type, t.category,
          branchName(t.branchId),
          String(t.amount),
          t.note || "",
          t.source === "auto" ? "تلقائي" : "يدوي",
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(query);
      });
    }
    return [...list].sort((a, b) => {
      if (sort === "date_desc")   return a.dateISO < b.dateISO ? 1 : -1;
      if (sort === "date_asc")    return a.dateISO > b.dateISO ? 1 : -1;
      if (sort === "amount_desc") return (b.amount || 0) - (a.amount || 0);
      if (sort === "amount_asc")  return (a.amount || 0) - (b.amount || 0);
      return 0;
    });
  }, [monthTx, q, typeFilter, sourceFilter, categoryFilter, sort]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Grouped tx views (UI-only grouping — no DB changes) ────────────────────
  const groupedTxViews = useMemo((): GroupedTxView[] => {
    const mainTx = visibleTx.filter(
      (t) => !t.autoKey?.startsWith("session-field:") && !t.autoKey?.startsWith("sub_income:")
    );

    return mainTx.map((txItem): GroupedTxView => {
      const subItems: SubItem[] = [];

      if (txItem.autoKey?.startsWith("salary:")) {
        const parts      = txItem.autoKey.split(":");
        const staffId    = parts[2];
        const branchId   = parts[3];
        const staffMember = staff.find((s) => s.id === staffId);
        const branchCount = staffMember?.branchIds?.length || 1;
        const baseSalaryForBranch = staffMember
          ? Math.round(((staffMember.monthlySalary || 0) / branchCount) * 100) / 100
          : null;

        staffAttendance
          .filter((a) =>
            a.staff_id === staffId &&
            a.branch_id === branchId &&
            a.deduct_from_salary &&
            a.deduction_amount > 0
          )
          .forEach((a) => {
            const statusLabel = ATTENDANCE_STATUS_LABELS[a.status] ?? a.status;
            subItems.push({
              id: a.id,
              date: a.date,
              label: `خصم — ${statusLabel}`,
              amount: -a.deduction_amount,
            });
          });

        monthTx
          .filter((t) => t.autoKey?.startsWith(`sub_income:${txItem.autoKey!.split(":")[1]}:${staffId}:`))
          .forEach((t) => {
            subItems.push({
              id: t.id,
              date: t.dateISO,
              label: t.note ?? "مكافأة حضور بديل",
              amount: t.amount,
            });
          });

        const totalAdditions  = subItems.filter((i) => i.amount > 0).reduce((s, i) => s + i.amount, 0);
        const grossAmount = txItem.amount + totalAdditions;
        if (baseSalaryForBranch && baseSalaryForBranch > 0) {
          subItems.unshift({
            id: `base-${txItem.id}`,
            date: txItem.dateISO,
            label: "الراتب الأساسي",
            amount: baseSalaryForBranch,
          });
        }
        return { tx: txItem, subItems, grossAmount };
      }

      if (txItem.autoKey?.startsWith("rent:")) {
        const branchId = txItem.autoKey.split(":")[2];
        const branch   = branches.find((b) => b.id === branchId);

        if (branch?.rent_type === "per_session" && branch.monthly_rent > 0) {
          const [y, m] = selectedMonth.split("-").map(Number);
          const scheduled = countSessionsInMonth(y, m, branch.days);
          const gross = Math.round(scheduled * branch.monthly_rent * 100) / 100;

          // Show base cost first (mirrors the salary "الراتب الأساسي" pattern).
          // This makes the presentation consistent: header = net, first sub-item = gross base,
          // further sub-items = per-cancellation savings (negative).
          if (gross > 0) {
            subItems.unshift({
              id: `base-rent-${txItem.id}`,
              date: `${selectedMonth}-01`,
              label: `إيجار الملعب الأساسي (${scheduled} حصة × ${branch.monthly_rent} د.ك)`,
              amount: gross,
            });
          }

          sessions
            .filter(
              (s) =>
                s.branch_id === branchId &&
                s.date.slice(0, 7) === selectedMonth &&
                s.status === "cancelled"
            )
            .forEach((s) => {
              // Look up the session-field finance entry, explicitly excluding
              // suppressed entries (source="suppressed" means the cancellation
              // was undone — sub-item must not appear for restored sessions).
              const sfEntry = tx.find(
                (t2) =>
                  t2.autoKey === `session-field:${branchId}:${s.date}` &&
                  t2.source !== "suppressed"
              );
              // Only show sub-item when there is an active entry explicitly
              // recording zero field cost — never when entry is absent or suppressed.
              if (sfEntry?.amount === 0) {
                subItems.push({
                  id: `sf-${s.id}`,
                  date: s.date,
                  label: "حصة ملغاة — توفير تكلفة الملعب",
                  amount: -branch.monthly_rent,
                });
              }
            });

          // grossAmount = txItem.amount (net) so the grouped header matches
          // the KPI card and detail rows — no gross/net mismatch.
          return { tx: txItem, subItems, grossAmount: txItem.amount };
        }
        return { tx: txItem, subItems: [], grossAmount: txItem.amount };
      }

      if (txItem.autoKey?.startsWith("rev:")) {
        const branchId = txItem.autoKey.split(":")[2];

        payments
          .filter(
            (p) =>
              p.branchId === branchId &&
              p.dateISO.slice(0, 7) === selectedMonth
          )
          .forEach((p) => {
            const playerName = playerMap.get(p.playerId) ?? "لاعب";
            const kindLabel  =
              p.kind === "new" ? "جديد" : p.kind === "renew" ? "تجديد" : "مستورد";
            subItems.push({
              id: p.id,
              date: p.dateISO,
              label: `${kindLabel} — ${playerName}`,
              amount: p.amount,
            });
          });

        return { tx: txItem, subItems, grossAmount: txItem.amount };
      }

      return { tx: txItem, subItems: [], grossAmount: txItem.amount };
    });
  }, [visibleTx, tx, staff, staffAttendance, branches, sessions, payments, playerMap, selectedMonth]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset finance page when filters change
  useEffect(() => { setFinPage(1); }, [selectedMonth, selectedBranch, q, typeFilter, sourceFilter, categoryFilter, sort, finPageSize]);

  const finTotalPages = Math.max(1, Math.ceil(groupedTxViews.length / finPageSize));
  const paginatedGroupedTxViews = useMemo(
    () => groupedTxViews.slice((finPage - 1) * finPageSize, finPage * finPageSize),
    [groupedTxViews, finPage, finPageSize]
  );

  // ── Branch P&L (per-branch revenue / expense / net profit) ────────────────
  // Computed from the full selected-month tx (no branch filter applied here,
  // so the table always shows ALL branches regardless of the branch-filter dropdown).
  const branchPL = useMemo(() => {
    const base = tx
      .filter((t) => t.source !== "suppressed")
      .filter((t) => t.month === selectedMonth);

    const rows = branches.map((b) => {
      const bTx      = base.filter((t) => t.branchId === b.id);
      const revenue  = bTx.filter((t) => t.type === "إيراد").reduce((s, t) => s + t.amount, 0);
      const expenses = bTx.filter((t) => t.type === "مصروف").reduce((s, t) => s + t.amount, 0);
      return { id: b.id, name: b.name, revenue, expenses, profit: revenue - expenses };
    });

    // Academy-wide transactions (branchId === "all")
    const genTx       = base.filter((t) => t.branchId === "all");
    const genRevenue  = genTx.filter((t) => t.type === "إيراد").reduce((s, t) => s + t.amount, 0);
    const genExpenses = genTx.filter((t) => t.type === "مصروف").reduce((s, t) => s + t.amount, 0);
    if (genRevenue > 0 || genExpenses > 0) {
      rows.push({ id: "all", name: "عام (الأكاديمية)", revenue: genRevenue, expenses: genExpenses, profit: genRevenue - genExpenses });
    }

    return rows.filter((r) => r.revenue > 0 || r.expenses > 0);
  }, [tx, selectedMonth, branches]);

  const [plExpanded, setPlExpanded] = useState(true);

  // ── Summary KPIs ───────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const revenue  = monthTx.filter((t) => t.type === "إيراد").reduce((s, t) => s + t.amount, 0);
    const expenses = monthTx.filter((t) => t.type === "مصروف").reduce((s, t) => s + t.amount, 0);
    const profit   = revenue - expenses;
    const margin   = revenue > 0 ? (profit / revenue) * 100 : 0;
    const salaries = monthTx.filter((t) => t.type === "مصروف" && t.category === "رواتب").reduce((s, t) => s + t.amount, 0);
    const field    = monthTx.filter((t) => t.type === "مصروف" && t.category === "حجز ملعب").reduce((s, t) => s + t.amount, 0);
    return { revenue, expenses, profit, margin, salaries, field };
  }, [monthTx]);

  const subscriptionKPI = useMemo(() => {
    const list = payments
      .filter((p) => p.dateISO.slice(0, 7) === selectedMonth)
      .filter((p) => selectedBranch === "all" ? true : p.branchId === selectedBranch);
    const sum = list.reduce((s, p) => s + paymentAmount(p), 0);
    return {
      count: list.length,
      sum,
      avg: list.length ? sum / list.length : 0,
      newCount:   list.filter((x) => x.kind === "new").length,
      renewCount: list.filter((x) => x.kind === "renew").length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payments, selectedMonth, selectedBranch]);

  const mom = useMemo(() => {
    const pm = prevMonthKey(selectedMonth);
    const prevMonthTx = tx
      .filter((t) => t.source !== "suppressed")
      .filter((t) => t.month === pm)
      .filter((t) => selectedBranch === "all" ? true : t.branchId === selectedBranch || t.branchId === "all");
    const prevRevenue  = prevMonthTx.filter((t) => t.type === "إيراد").reduce((s, t) => s + t.amount, 0);
    const prevExpenses = prevMonthTx.filter((t) => t.type === "مصروف").reduce((s, t) => s + t.amount, 0);
    return {
      prevMonth: pm,
      dRevenue:  summary.revenue  - prevRevenue,
      dExpenses: summary.expenses - prevExpenses,
      dProfit:   summary.profit   - (prevRevenue - prevExpenses),
    };
  }, [tx, selectedMonth, selectedBranch, summary]);

  // ── Modal helpers ───────────────────────────────────────────────────────────
  function resetForm() {
    setType("مصروف");
    setBranchId(selectedBranch === "all" ? "all" : selectedBranch);
    setCategory("أدوات");
    setAmount(0);
    setDateISO(`${selectedMonth}-01`);
    setNote("");
    setEditId(null);
    setSaveError(null);
  }

  function openAdd() {
    resetForm();
    setOpen(true);
  }

  function openEdit(item: FinanceTx) {
    setEditId(item.id);
    setType(item.type);
    setBranchId(item.branchId);
    setCategory(item.category);
    setAmount(item.amount);
    setDateISO(item.dateISO);
    setNote(item.note ?? "");
    setSaveError(null);
    setOpen(true);
  }

  function validateTx(): string | null {
    if (!dateISO) return "اختر التاريخ.";
    if (!Number.isFinite(amount) || amount <= 0) return "أدخل مبلغ صحيح.";
    if (!category) return "اختر التصنيف.";
    return null;
  }

  // ── Save tx ─────────────────────────────────────────────────────────────────
  async function saveTx() {
    const err = validateTx();
    if (err) { setSaveError(err); return; }

    setSaving(true);
    setSaveError(null);
    try {
      const month = monthKey(dateISO);

      if (editId) {
        const existing = tx.find((t) => t.id === editId);
        const becomesManual = existing?.source === "auto";

        const updated = await updateFinanceTx(editId, {
          month,
          date: dateISO,
          type,
          branch_id: branchId,
          category,
          amount: Number(amount),
          note: note.trim() || null,
          source: becomesManual ? "manual" : (existing?.source ?? "manual"),
          overridden_auto_key: becomesManual
            ? existing?.autoKey ?? null
            : existing?.overriddenAutoKey ?? null,
          auto_key: becomesManual ? null : existing?.autoKey ?? null,
        });

        setTx((prev) => prev.map((t) => (t.id === editId ? dbToTx(updated) : t)));
      } else {
        const created = await createFinanceTx({
          month,
          date: dateISO,
          type,
          branch_id: branchId,
          category,
          amount: Number(amount),
          note: note.trim() || null,
          source: "manual",
        });
        setTx((prev) => [dbToTx(created), ...prev]);
      }

      setOpen(false);
      resetForm();
    } catch (e) {
      console.error("[finance] save error:", e);
      setSaveError(formatError(e));
    } finally {
      setSaving(false);
    }
  }

  // ── Remove tx ───────────────────────────────────────────────────────────────
  async function removeTx(item: FinanceTx) {
    if (!confirm("حذف هذا البند؟")) return;
    try {
      if (item.source === "auto" && item.autoKey) {
        const updated = await updateFinanceTx(item.id, {
          source: "suppressed",
          amount: 0,
          note: null,
        });
        setTx((prev) => prev.map((x) => (x.id === item.id ? dbToTx(updated) : x)));
        lastAutoSyncRef.current = "";
      } else {
        await deleteFinanceTx(item.id);
        setTx((prev) => prev.filter((x) => x.id !== item.id));
      }
    } catch (e) {
      console.error("[finance] delete error:", e);
      alert(formatError(e));
    }
  }

  // ── Export CSV wrapper ──────────────────────────────────────────────────────
  function handleExportCSV() {
    exportCSVFn(visibleTx, selectedMonth, selectedBranch, branches);
  }

  // ── Print Finance wrapper ───────────────────────────────────────────────────
  function handlePrintFinance(mode: PrintMode) {
    printFinanceReport(groupedTxViews, mode, selectedMonth, selectedBranch, branches, () => setPrintOpen(false));
  }

  // ── Month change (resets auto-sync key) ────────────────────────────────────
  function handleMonthChange(month: string) {
    lastAutoSyncRef.current = "";
    setSelectedMonth(month);
  }

  return {
    // data
    branches,
    staff,
    tx,
    payments,
    players,
    playerMap,
    // loading / error
    loading,
    pageError,
    autoSyncing,
    saving,
    saveError,
    // derived views
    monthTx,
    visibleTx,
    groupedTxViews,
    paginatedGroupedTxViews,
    finTotalPages,
    branchPL,
    summary,
    subscriptionKPI,
    mom,
    // filters
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
    // pagination
    finPage,
    setFinPage,
    finPageSize,
    setFinPageSize,
    // access
    hasFinanceAccess,
    // ui state
    expandedTxIds,
    toggleExpand,
    printOpen,
    setPrintOpen,
    openMenu,
    setOpenMenu,
    plExpanded,
    setPlExpanded,
    // modal
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
    // operations
    loadData,
    openAdd,
    openEdit,
    saveTx,
    removeTx,
    exportCSV: handleExportCSV,
    printFinance: handlePrintFinance,
    // helpers
    branchName,
  };
}
