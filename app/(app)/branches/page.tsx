"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  type DbBranch,
  type BranchInsert,
  listBranches,
  createBranch,
  updateBranch,
  deleteBranch,
} from "@/src/lib/supabase/branches";
import { listStaff, updateStaffMember } from "@/src/lib/supabase/staff";
import { Button } from "@/app/components/ui/Button";
import { Modal } from "@/app/components/ui/Modal";
import { type AcademyDiag, diagnoseAcademy } from "@/src/lib/supabase/academyId";
import { getMembership, isOwnerOrPartner } from "@/src/lib/supabase/roles";
import { createClient } from "@/src/lib/supabase/browser";
import { formatError } from "@/src/lib/utils";

// ── Constants ─────────────────────────────────────────────────────────────────

type Weekday =
  | "السبت"
  | "الأحد"
  | "الاثنين"
  | "الثلاثاء"
  | "الأربعاء"
  | "الخميس"
  | "الجمعة";

const WEEKDAYS: Weekday[] = [
  "السبت",
  "الأحد",
  "الاثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
];

type SubscriptionMode = "حصص" | "شهري";

// ── Helpers ───────────────────────────────────────────────────────────────────

function toWeekdays(arr: string[]): Weekday[] {
  return arr.filter((d): d is Weekday => (WEEKDAYS as string[]).includes(d));
}

function cls(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(" ");
}

// ── Dev probe: raw SELECT from branches ───────────────────────────────────────

type BranchesProbe = {
  data: unknown;
  error: string | null;
  status: number | null;
};

async function probeBranches(): Promise<BranchesProbe> {
  const supabase = createClient();
  const { data, error, status } = await supabase
    .from("branches")
    .select("id, academy_id")
    .limit(1);
  return {
    data,
    error: error ? formatError(error) : null,
    status,
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BranchesPage() {
  const [branches, setBranches] = useState<DbBranch[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Error shown inside the modal (replaces alert)
  const [saveError, setSaveError] = useState<string | null>(null);

  // modal state
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [editId, setEditId] = useState<string | null>(null);

  // form fields
  const [name, setName] = useState("");
  const [days, setDays] = useState<Weekday[]>([]);
  const [startTime, setStartTime] = useState("17:00");
  const [endTime, setEndTime] = useState("18:00");
  const [price, setPrice] = useState("40");
  const [subscriptionMode, setSubscriptionMode] =
    useState<SubscriptionMode>("حصص");
  const [rentType, setRentType] = useState<"fixed_monthly" | "per_session">("fixed_monthly");
  const [monthlyRent, setMonthlyRent] = useState("0");

  const daysPerWeek = useMemo(() => days.length, [days]);

  // ── Role gate: only owner/partner can create/edit/delete branches ────────────
  // null = still resolving (hide buttons until known to avoid flash)
  const [canManageBranches, setCanManageBranches] = useState<boolean | null>(null);

  useEffect(() => {
    getMembership()
      .then((m) => setCanManageBranches(isOwnerOrPartner(m.role)))
      .catch(() => setCanManageBranches(false));
  }, []);

  // ── Dev diagnostics ──────────────────────────────────────────────────────────
  const [diag, setDiag] = useState<AcademyDiag | null>(null);
  const [probe, setProbe] = useState<BranchesProbe | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      diagnoseAcademy().then(setDiag).catch(() => null);
      probeBranches().then(setProbe).catch(() => null);
    }
  }, []);

  // ── Load ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    setLoading(true);
    listBranches()
      .then(setBranches)
      .catch((e: unknown) => {
        console.error("[branches] load error:", e);
        setPageError(formatError(e));
      })
      .finally(() => setLoading(false));
  }, []);

  // ── Form helpers ───────────────────────────────────────────────────────────

  function resetForm() {
    setName("");
    setDays([]);
    setStartTime("17:00");
    setEndTime("18:00");
    setPrice("40");
    setSubscriptionMode("حصص");
    setRentType("fixed_monthly");
    setMonthlyRent("0");
    setEditId(null);
    setSaveError(null);
  }

  function openCreate() {
    resetForm();
    setMode("create");
    setOpen(true);
  }

  function openEdit(branch: DbBranch) {
    setMode("edit");
    setEditId(branch.id);
    setName(branch.name);
    setDays(toWeekdays(branch.days));
    setStartTime(branch.start_time ?? "17:00");
    setEndTime(branch.end_time ?? "18:00");
    setPrice(String(branch.price ?? 0));
    setSubscriptionMode(
      (branch.subscription_mode as SubscriptionMode) ?? "حصص"
    );
    setRentType((branch.rent_type as "fixed_monthly" | "per_session") ?? "fixed_monthly");
    setMonthlyRent(String(branch.monthly_rent ?? 0));
    setSaveError(null);
    setOpen(true);
  }

  function toggleDay(d: Weekday) {
    setDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]
    );
  }

  function validate(): string | null {
    if (!name.trim()) return "اكتب اسم الفرع.";
    if (days.length === 0) return "اختر يوم تمرين واحد على الأقل.";
    if (!startTime || !endTime) return "حدد وقت البداية والنهاية.";
    if (endTime <= startTime) return "وقت النهاية لازم يكون بعد وقت البداية.";
    const p = Number(price);
    if (!Number.isFinite(p) || p <= 0)
      return "سعر الاشتراك لازم يكون رقم أكبر من صفر.";
    return null;
  }

  // ── Save (create / update) ─────────────────────────────────────────────────

  async function saveBranch() {
    setSaveError(null);
    const err = validate();
    if (err) {
      setSaveError(err);
      return;
    }

    const payload: BranchInsert = {
      name: name.trim(),
      days: [...days],
      start_time: startTime,
      end_time: endTime,
      price: Number(price),
      subscription_mode: subscriptionMode,
      rent_type: rentType,
      monthly_rent: Number(monthlyRent) || 0,
    };

    setSaving(true);
    try {
      if (mode === "create") {
        const created = await createBranch(payload);
        setBranches((prev) => [created, ...prev]);
        // Sync staff with assign_mode="all": add new branch to their branch_ids
        // so Finance sync and session deductions include them immediately.
        listStaff().then((staffList) => {
          const allModeStaff = staffList.filter(
            (s) => s.assign_mode === "all" && s.is_active
          );
          Promise.all(
            allModeStaff
              .filter((s) => !s.branch_ids.includes(created.id))
              .map((s) =>
                updateStaffMember(s.id, {
                  branch_ids: [...s.branch_ids, created.id],
                })
              )
          ).catch((e) =>
            console.error("[branches] failed to sync all-mode staff for new branch:", e)
          );
        }).catch(() => null);
      } else {
        if (!editId) return;
        const updated = await updateBranch(editId, payload);
        setBranches((prev) =>
          prev.map((b) => (b.id === editId ? updated : b))
        );
      }
      setOpen(false);
      resetForm();
    } catch (e: unknown) {
      console.error("[branches] save error:", e);
      setSaveError(formatError(e));
    } finally {
      setSaving(false);
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  async function removeBranch(id: string) {
    if (!confirm("تأكيد حذف الفرع؟")) return;
    try {
      await deleteBranch(id);
      setBranches((prev) => prev.filter((b) => b.id !== id));
      // Sync staff with assign_mode="all": remove deleted branch from their branch_ids
      listStaff().then((staffList) => {
        const allModeStaff = staffList.filter((s) => s.assign_mode === "all");
        Promise.all(
          allModeStaff
            .filter((s) => s.branch_ids.includes(id))
            .map((s) =>
              updateStaffMember(s.id, {
                branch_ids: s.branch_ids.filter((bid) => bid !== id),
              })
            )
        ).catch((e) =>
          console.error("[branches] failed to sync all-mode staff on branch delete:", e)
        );
      }).catch(() => null);
    } catch (e: unknown) {
      console.error("[branches] delete error:", e);
      setPageError(formatError(e));
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <main className="flex-1 p-4 md:p-8">

          {/* ── DEV diagnostic panel ────────────────────────────────────────── */}
          {process.env.NODE_ENV !== "production" && (diag || probe) && (
            <details
              open={!!(diag?.resolvedError || diag?.profileBlocked || probe?.error)}
              className="mb-5 rounded-xl border border-yellow-500/30 bg-yellow-500/5 text-xs font-mono"
            >
              <summary className="cursor-pointer select-none px-4 py-2 font-semibold text-yellow-300">
                🛠 DEV — branch diagnostics
                {(diag?.resolvedError || probe?.error) && (
                  <span className="mr-2 text-red-400">[ISSUE DETECTED]</span>
                )}
                {!diag?.resolvedError && !probe?.error && (
                  <span className="mr-2 text-emerald-400">[OK]</span>
                )}
              </summary>

              <div className="space-y-1 px-4 pb-4 pt-2">
                <DevRow
                  label="auth user_id"
                  value={diag?.userId ?? "— not authenticated —"}
                  ok={!!diag?.userId}
                />
                <DevRow
                  label="profiles.academy_id"
                  value={
                    diag?.profileBlocked
                      ? "⚠ null + no error — RLS SELECT policy missing on profiles"
                      : diag?.profileError
                      ? `✗ ${diag.profileError}`
                      : diag?.profileData?.academy_id
                      ? `✓ ${diag.profileData.academy_id}`
                      : "— no profile row —"
                  }
                  ok={!!diag?.profileData?.academy_id}
                  warn={!!diag?.profileBlocked}
                />
                <DevRow
                  label="resolved academy_id"
                  value={
                    diag?.resolved
                      ? `✓ ${diag.resolved}`
                      : `✗ ${diag?.resolvedError ?? "unknown"}`
                  }
                  ok={!!diag?.resolved}
                />
                <DevRow
                  label="branches probe (SELECT id LIMIT 1)"
                  value={
                    probe?.error
                      ? `✗ ${probe.error} [HTTP ${probe.status}]`
                      : probe
                      ? `✓ HTTP ${probe.status} — rows returned: ${JSON.stringify(probe.data)}`
                      : "…"
                  }
                  ok={!probe?.error}
                />
              </div>
            </details>
          )}

          {/* Header */}
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold">الفروع</h1>
              <p className="text-sm text-white/60">
                أضف فروعك وحدد أيام ووقت التمرين وسعر الاشتراك ونظام
                الاشتراك.
              </p>
            </div>
            {canManageBranches && (
              <Button onClick={openCreate}>+ إضافة فرع</Button>
            )}
          </div>

          {/* Error banner */}
          {pageError && (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              <span>{pageError}</span>
              <Link
                href="/register"
                className="inline-flex items-center rounded-xl bg-emerald-500/80 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
              >
                اضغط هنا لإضافة أكاديمية
              </Link>
            </div>
          )}

          {/* Table */}
          <div className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-white/5">

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-white/[0.07]">
              {loading ? (
                <div className="px-4 py-4 space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-24 rounded-xl bg-white/[0.04] animate-pulse" />
                  ))}
                </div>
              ) : branches.length === 0 ? (
                <div className="px-4 py-6 text-white/60 text-sm text-center">
                  لا يوجد فروع بعد. اضغط &quot;إضافة فرع&quot;.
                </div>
              ) : (
                branches.map((b) => (
                  <div key={b.id} className="px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-white">{b.name}</div>
                        <div className="mt-1 text-xs text-white/55 space-y-0.5">
                          <div>{b.days.join("، ")}</div>
                          <div>{b.start_time} - {b.end_time}</div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-bold text-[#63C0B0]">{b.price} د.ك</div>
                        <div className="text-xs text-white/40 mt-0.5">{b.subscription_mode}</div>
                      </div>
                    </div>
                    {canManageBranches ? (
                      <div className="mt-3 flex gap-2">
                        <Button variant="ghost" size="xs" onClick={() => openEdit(b)}>تعديل</Button>
                        <Button variant="danger" size="xs" onClick={() => removeBranch(b.id)}>حذف</Button>
                      </div>
                    ) : (
                      <div className="mt-2 text-xs text-white/30">قراءة فقط</div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-white/5 text-white/70">
                  <tr>
                    <th className="px-4 py-3 text-right font-semibold">
                      اسم الفرع
                    </th>
                    <th className="px-4 py-3 text-right font-semibold">
                      الأيام
                    </th>
                    <th className="px-4 py-3 text-right font-semibold">
                      الوقت
                    </th>
                    <th className="px-4 py-3 text-right font-semibold">
                      السعر
                    </th>
                    <th className="px-4 py-3 text-right font-semibold">
                      نظام الاشتراك
                    </th>
                    <th className="px-4 py-3 text-right font-semibold">
                      إجراء
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-white/10">
                  {loading ? (
                    <tr>
                      <td className="px-4 py-6 text-white/40" colSpan={6}>
                        جاري التحميل…
                      </td>
                    </tr>
                  ) : branches.length === 0 ? (
                    <tr>
                      <td className="px-4 py-6 text-white/60" colSpan={6}>
                        لا يوجد فروع بعد. اضغط &quot;إضافة فرع&quot;.
                      </td>
                    </tr>
                  ) : (
                    branches.map((b) => (
                      <tr
                        key={b.id}
                        className="hover:bg-white/5 transition"
                      >
                        <td className="px-4 py-3 font-medium">{b.name}</td>
                        <td className="px-4 py-3 text-white/80">
                          {b.days.join("، ")}
                        </td>
                        <td className="px-4 py-3 text-white/80">
                          {b.start_time} - {b.end_time}
                        </td>
                        <td className="px-4 py-3 text-white/80">
                          {b.price} د.ك
                        </td>
                        <td className="px-4 py-3 text-white/80">
                          {b.subscription_mode}
                        </td>
                        <td className="px-4 py-3">
                          {canManageBranches ? (
                            <div className="flex items-center gap-2">
                              <Button variant="ghost" size="xs" onClick={() => openEdit(b)}>
                                تعديل
                              </Button>
                              <Button variant="danger" size="xs" onClick={() => removeBranch(b.id)}>
                                حذف
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-white/30">قراءة فقط</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>{/* hidden md:block */}
          </div>

          {/* Modal */}
          <Modal open={open} onClose={() => setOpen(false)}>
              <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-[#0e1730] p-5 shadow-xl max-h-[92vh] overflow-y-auto">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">
                    {mode === "create" ? "إضافة فرع" : "تعديل فرع"}
                  </h2>
                  <button
                    onClick={() => setOpen(false)}
                    className="rounded-lg px-2 py-1 text-white/70 hover:bg-white/10"
                    aria-label="close"
                    type="button"
                  >
                    ✕
                  </button>
                </div>

                <div className="mt-4 grid gap-4">
                  {/* Name */}
                  <div>
                    <label className="mb-2 block text-sm text-white/70">
                      اسم الفرع
                    </label>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="مثال: صباح السالم"
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-emerald-400/60"
                    />
                  </div>

                  {/* Price */}
                  <div>
                    <label className="mb-2 block text-sm text-white/70">
                      سعر الاشتراك (د.ك)
                    </label>
                    <input
                      inputMode="decimal"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="مثال: 40"
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-emerald-400/60"
                    />
                  </div>

                  {/* Subscription mode */}
                  <div>
                    <label className="mb-2 block text-sm text-white/70">
                      نظام الاشتراك
                    </label>
                    <div className="flex gap-2">
                      {(["حصص", "شهري"] as SubscriptionMode[]).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setSubscriptionMode(m)}
                          className={cls(
                            "h-10 px-4 rounded-full text-sm transition",
                            subscriptionMode === m
                              ? "bg-white/10 text-white"
                              : "bg-[#0F172A] text-white/70 hover:bg-white/5 hover:text-white"
                          )}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Rent type */}
                  <div>
                    <label className="mb-2 block text-sm text-white/70">
                      نظام إيجار الملعب
                    </label>
                    <div className="flex gap-2">
                      {(["fixed_monthly", "per_session"] as const).map((rt) => (
                        <button
                          key={rt}
                          type="button"
                          onClick={() => setRentType(rt)}
                          className={cls(
                            "h-10 px-4 rounded-full text-sm transition",
                            rentType === rt
                              ? "bg-white/10 text-white"
                              : "bg-[#0F172A] text-white/70 hover:bg-white/5 hover:text-white"
                          )}
                        >
                          {rt === "fixed_monthly" ? "إيجار شهري ثابت" : "بالحصة"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Monthly rent */}
                  <div>
                    <label className="mb-2 block text-sm text-white/70">
                      {rentType === "per_session" ? "سعر الحصة (د.ك)" : "إيجار الملعب الشهري (د.ك)"}
                    </label>
                    <input
                      inputMode="decimal"
                      value={monthlyRent}
                      onChange={(e) => setMonthlyRent(e.target.value)}
                      placeholder="0"
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-emerald-400/60"
                    />
                  </div>

                  {/* Days */}
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <label className="block text-sm text-white/70">
                        أيام التمرين
                      </label>
                      <span className="text-xs text-white/60">
                        عدد الأيام بالأسبوع:{" "}
                        <span className="font-semibold text-white">
                          {daysPerWeek}
                        </span>
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {WEEKDAYS.map((d) => {
                        const active = days.includes(d);
                        return (
                          <button
                            key={d}
                            type="button"
                            onClick={() => toggleDay(d)}
                            className={cls(
                              "rounded-xl border px-3 py-2 text-sm transition text-right",
                              active
                                ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-200"
                                : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                            )}
                          >
                            {active ? "✓ " : ""}
                            {d}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Time */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm text-white/70">
                        وقت البداية
                      </label>
                      <input
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-emerald-400/60"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm text-white/70">
                        وقت النهاية
                      </label>
                      <input
                        type="time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-emerald-400/60"
                      />
                    </div>
                  </div>

                  {/* Save error — shown inside modal, never as alert */}
                  {saveError && (
                    <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-300 break-all">
                      <div className="font-semibold mb-1">فشل الحفظ:</div>
                      {saveError}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="mt-2 flex items-center justify-end gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => setOpen(false)}
                      disabled={saving}
                    >
                      إلغاء
                    </Button>
                    <Button onClick={saveBranch} disabled={saving}>
                      {saving
                        ? "جاري الحفظ…"
                        : mode === "create"
                        ? "حفظ الفرع"
                        : "حفظ التعديل"}
                    </Button>
                  </div>
                </div>
              </div>
          </Modal>
        </main>
  );
}

// ── Dev helper ────────────────────────────────────────────────────────────────

function DevRow({
  label,
  value,
  ok,
  warn,
}: {
  label: string;
  value: string;
  ok: boolean;
  warn?: boolean;
}) {
  const color = ok ? "text-emerald-300" : warn ? "text-yellow-300" : "text-red-300";
  return (
    <div className="flex gap-2">
      <span className="w-52 shrink-0 text-white/40">{label}</span>
      <span className={`${color} break-all`}>{value}</span>
    </div>
  );
}
