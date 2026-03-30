"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/src/lib/supabase/browser";
import { getUserRole, roleLabel, type UserRole } from "@/src/lib/supabase/roles";
import { clearSidebarCache } from "@/app/components/Sidebar";

export default function SettingsPage() {
  const supabase = createClient();

  // Loaded from DB
  const [academyId, setAcademyId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<UserRole>("admin_staff");

  // Editable fields
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [academyName, setAcademyName] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgType, setMsgType] = useState<"ok" | "err">("ok");
  const logoInputRef = useRef<HTMLInputElement>(null);

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

      // Load academy name + logo
      const { data: academy, error: aErr } = await supabase
        .from("academies")
        .select("name, logo_url")
        .eq("id", profile.academy_id)
        .single();

      if (aErr) {
        showMsg(`خطأ في تحميل الأكاديمية: ${aErr.message}`, "err");
        return;
      }

      setAcademyName(academy?.name ?? "");
      setLogoUrl(academy?.logo_url ?? null);
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Logo remove ───────────────────────────────────────────────────────────
  const removeLogo = async () => {
    if (!academyId) return;
    if (!confirm("هل تريد حذف شعار الأكاديمية؟")) return;
    setLogoUploading(true);
    setMsg(null);
    try {
      // Clear logo_url in DB
      const { error: aErr } = await supabase
        .from("academies")
        .update({ logo_url: null })
        .eq("id", academyId);

      if (aErr) throw new Error(`فشل حذف الشعار: ${aErr.message}`);

      setLogoUrl(null);
      clearSidebarCache();
      showMsg("✅ تم حذف الشعار.", "ok");
    } catch (e: unknown) {
      showMsg(e instanceof Error ? e.message : "حدث خطأ أثناء حذف الشعار.", "err");
    } finally {
      setLogoUploading(false);
    }
  };

  // ── Logo upload ───────────────────────────────────────────────────────────
  const uploadLogo = async (file: File) => {
    if (!academyId) return;
    setLogoUploading(true);
    setMsg(null);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const path = `${academyId}/logo.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("academy-logos")
        .upload(path, file, { upsert: true, contentType: file.type });

      if (upErr) throw new Error(`فشل رفع الشعار: ${upErr.message}`);

      const { data } = supabase.storage.from("academy-logos").getPublicUrl(path);
      const url = `${data.publicUrl}?t=${Date.now()}`;

      const { error: aErr } = await supabase
        .from("academies")
        .update({ logo_url: url })
        .eq("id", academyId);

      if (aErr) throw new Error(`فشل حفظ الشعار: ${aErr.message}`);

      setLogoUrl(url);
      clearSidebarCache();
      showMsg("✅ تم رفع الشعار بنجاح.", "ok");
    } catch (e: unknown) {
      showMsg(e instanceof Error ? e.message : "حدث خطأ أثناء رفع الشعار.", "err");
    } finally {
      setLogoUploading(false);
    }
  };

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
    <main className="flex-1 p-4 md:p-8">
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

            {/* Logo upload — owner/partner only */}
            {(userRole === "owner" || userRole === "partner") && (
              <div>
                <label className="block text-xs text-white/60 mb-2">شعار الأكاديمية</label>
                <div className="flex items-center gap-4">
                  {/* Preview */}
                  <div className="h-14 w-14 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                    {logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={logoUrl} alt="شعار الأكاديمية" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-xl font-bold text-white/30">
                        {academyName ? academyName[0] : "A"}
                      </span>
                    )}
                  </div>

                  {/* Upload / Remove buttons */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => logoInputRef.current?.click()}
                        disabled={logoUploading}
                        className="h-9 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-sm font-medium transition disabled:opacity-60"
                      >
                        {logoUploading ? "جاري المعالجة..." : "رفع شعار"}
                      </button>
                      {logoUrl && (
                        <button
                          type="button"
                          onClick={removeLogo}
                          disabled={logoUploading}
                          className="h-9 px-4 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-sm font-medium text-red-400 transition disabled:opacity-60"
                        >
                          حذف الشعار
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-white/35">
                      JPG أو PNG أو WebP — حتى 2 MB
                    </p>
                  </div>

                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadLogo(file);
                      e.target.value = "";
                    }}
                  />
                </div>
              </div>
            )}

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
