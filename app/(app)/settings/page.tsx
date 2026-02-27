"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/src/lib/supabase/browser";
import { getUserRole, roleLabel, type UserRole } from "@/src/lib/supabase/roles";

export default function SettingsPage() {
  const supabase = createClient();

  // Loaded from DB
  const [academyId, setAcademyId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<UserRole>("admin_staff");

  // Editable fields
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [academyName, setAcademyName] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgType, setMsgType] = useState<"ok" | "err">("ok");

  // ── Load on mount ─────────────────────────────────────────────────────────
  useEffect(() => {
    const run = async () => {
      const [
        { data: { user }, error: authErr },
        role,
      ] = await Promise.all([
        supabase.auth.getUser(),
        getUserRole(),
      ]);

      if (authErr || !user) {
        showMsg("يرجى تسجيل الدخول أولاً.", "err");
        return;
      }

      setUserRole(role);

      // Load profile
      const { data: profile, error: pErr } = await supabase
        .from("profiles")
        .select("academy_id, full_name, phone")
        .eq("user_id", user.id)
        .maybeSingle();

      if (pErr) {
        showMsg(`خطأ في تحميل الملف الشخصي: ${pErr.message}`, "err");
        return;
      }

      if (!profile?.academy_id) {
        showMsg("لا يوجد ملف شخصي. أعد التسجيل أو تواصل مع الدعم.", "err");
        return;
      }

      setAcademyId(profile.academy_id);
      setFullName(profile.full_name ?? "");
      setPhone(profile.phone ?? "");

      // Load academy name
      const { data: academy, error: aErr } = await supabase
        .from("academies")
        .select("name")
        .eq("id", profile.academy_id)
        .single();

      if (aErr) {
        showMsg(`خطأ في تحميل الأكاديمية: ${aErr.message}`, "err");
        return;
      }

      setAcademyName(academy?.name ?? "");
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Save ──────────────────────────────────────────────────────────────────
  const save = async () => {
    setMsg(null);

    const trimName = fullName.trim();

    if (!trimName) {
      showMsg("الاسم الكامل مطلوب.", "err");
      return;
    }

    setLoading(true);

    try {
      const {
        data: { user },
        error: authErr,
      } = await supabase.auth.getUser();

      if (authErr || !user) throw new Error("يرجى تسجيل الدخول أولاً.");

      // Update profile (full_name + phone) — any member can update their own
      const { error: pErr } = await supabase
        .from("profiles")
        .update({ full_name: trimName, phone: phone.trim() })
        .eq("user_id", user.id);

      if (pErr) throw new Error(`فشل تحديث الملف الشخصي: ${pErr.message}`);

      // Update academy name — only owner can do this (enforced by RLS on academies)
      if (academyId && (userRole === "owner" || userRole === "partner")) {
        const trimAcademy = academyName.trim();
        if (!trimAcademy) {
          throw new Error("اسم الأكاديمية مطلوب.");
        }
        const { error: aErr } = await supabase
          .from("academies")
          .update({ name: trimAcademy })
          .eq("id", academyId);

        if (aErr) throw new Error(`فشل تحديث اسم الأكاديمية: ${aErr.message}`);
      }

      showMsg("✅ تم الحفظ بنجاح.", "ok");
    } catch (e: unknown) {
      showMsg(e instanceof Error ? e.message : "حدث خطأ.", "err");
    } finally {
      setLoading(false);
    }
  };

  function showMsg(text: string, type: "ok" | "err") {
    setMsg(text);
    setMsgType(type);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <main className="flex-1 p-8">
        <h1 className="text-2xl font-semibold mb-2">الإعدادات</h1>
        <p className="text-white/60 mb-6">تعديل بياناتك الشخصية وبيانات الأكاديمية</p>

        <div className="max-w-xl space-y-6">
          {/* Personal info */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-white/90">البيانات الشخصية</h2>
              <span className="text-xs text-white/40 px-2 py-0.5 rounded-full border border-white/10">
                {roleLabel[userRole]}
              </span>
            </div>

            <div>
              <label className="block text-xs text-white/60 mb-2">الاسم الكامل</label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full h-11 rounded-xl bg-[#0F172A] border border-white/10 px-4 outline-none focus:border-white/25"
                placeholder="مثال: جاسم البطيني"
              />
            </div>

            <div>
              <label className="block text-xs text-white/60 mb-2">رقم الهاتف</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full h-11 rounded-xl bg-[#0F172A] border border-white/10 px-4 outline-none focus:border-white/25"
                placeholder="+965 XXXXXXXX"
                type="tel"
                dir="ltr"
              />
            </div>
          </div>

          {/* Academy info — owner only can edit name */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
            <h2 className="font-semibold text-white/90">بيانات الأكاديمية</h2>

            <div>
              <label className="block text-xs text-white/60 mb-2">اسم الأكاديمية</label>
              {(userRole === "owner" || userRole === "partner") ? (
                <>
                  <input
                    value={academyName}
                    onChange={(e) => setAcademyName(e.target.value)}
                    className="w-full h-11 rounded-xl bg-[#0F172A] border border-white/10 px-4 outline-none focus:border-white/25"
                    placeholder='مثال: أكاديمية السالمية الرياضية'
                  />
                  <p className="mt-1 text-xs text-white/40">
                    تغيير الاسم لا يؤثر على البيانات المرتبطة بالأكاديمية.
                  </p>
                </>
              ) : (
                <div className="w-full h-11 rounded-xl bg-[#0F172A]/50 border border-white/5 px-4 flex items-center text-white/50 text-sm">
                  {academyName || "—"}
                  <span className="mr-auto text-xs text-white/30">للعرض فقط</span>
                </div>
              )}
            </div>

            {academyId && (
              <div>
                <label className="block text-xs text-white/40 mb-1">معرّف الأكاديمية (ثابت)</label>
                <div className="font-mono text-xs text-white/30 break-all">{academyId}</div>
              </div>
            )}
          </div>

          {/* Team management — owner only */}
          {(userRole === "owner" || userRole === "partner") && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-white/90">إدارة الفريق</h2>
                  <p className="text-xs text-white/50 mt-1">
                    دعوة أعضاء وإدارة الأدوار والصلاحيات
                  </p>
                </div>
                <Link
                  href="/settings/team"
                  className="h-9 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-sm font-medium transition flex items-center"
                >
                  إدارة الفريق ←
                </Link>
              </div>
            </div>
          )}

          {/* Message */}
          {msg && (
            <div
              className={`rounded-xl border px-4 py-3 text-sm ${
                msgType === "ok"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  : "border-red-500/30 bg-red-500/10 text-red-300"
              }`}
            >
              {msg}
            </div>
          )}

          {/* Save */}
          <button
            onClick={save}
            disabled={loading}
            className="h-11 px-8 rounded-xl bg-emerald-500/80 hover:bg-emerald-500 transition font-semibold disabled:opacity-60"
          >
            {loading ? "جاري الحفظ..." : "حفظ"}
          </button>
        </div>
      </main>
  );
}
