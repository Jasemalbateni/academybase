"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { setupAcademyAction, setupInvitedUserAction } from "@/app/register/actions";

export default function RegisterClient() {
  const supabase = createClient();
  const sp = useSearchParams();

  const inviteToken = sp.get("invite");
  const isInviteFlow = !!inviteToken;

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [academyName, setAcademyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    const cleanEmail = email.trim();
    if (!cleanEmail || !password || !fullName.trim()) {
      setErr("يرجى تعبئة جميع الحقول المطلوبة");
      return;
    }
    if (!isInviteFlow && !academyName.trim()) {
      setErr("يرجى تعبئة اسم الأكاديمية");
      return;
    }
    if (password.length < 6) {
      setErr("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
      return;
    }

    setLoading(true);

    try {
      const { data, error: authErr } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
      });

      if (authErr) {
        setErr(authErr.message);
        return;
      }

      if (!data.session) {
        if (isInviteFlow) {
          setErr(
            "تم إنشاء الحساب. تحقق من بريدك الإلكتروني لتفعيل الحساب، " +
            "ثم ارجع إلى رابط الدعوة لإتمام الانضمام."
          );
          window.location.replace(`/login?next=/invite/${inviteToken}`);
        } else {
          setErr(
            "تم إنشاء الحساب. تحقق من بريدك الإلكتروني لتفعيل الحساب ثم سجّل دخول."
          );
          window.location.replace("/login");
        }
        return;
      }

      if (isInviteFlow) {
        const result = await setupInvitedUserAction(fullName, phone);
        if (result.error) {
          setErr(result.error);
          return;
        }
        window.location.replace(`/invite/${inviteToken}`);
      } else {
        const result = await setupAcademyAction(fullName, phone, academyName);
        if (result.error) {
          setErr(result.error);
          return;
        }
        window.location.replace("/dashboard");
      }
    } catch (e) {
      console.error("[register] unexpected error:", e);
      setErr(
        e instanceof Error
          ? e.message
          : "حدث خطأ غير متوقع. حاول مجدداً."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6 bg-[#0B1220] text-white"
      dir="rtl"
    >
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-8 space-y-4"
      >
        {isInviteFlow ? (
          <>
            <h1 className="text-2xl font-semibold">إنشاء حساب للانضمام</h1>
            <p className="text-sm text-white/60">
              أنشئ حسابك ثم ستُحال تلقائياً لقبول دعوة الانضمام للأكاديمية.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold">إنشاء حساب جديد</h1>
            <p className="text-sm text-white/60">
              سجّل حسابك وأنشئ أكاديميتك في خطوة واحدة.
            </p>
          </>
        )}

        <div>
          <label className="block text-sm text-white/70 mb-2">
            الاسم الكامل <span className="text-red-400">*</span>
          </label>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full h-11 rounded-xl bg-[#0F172A] border border-white/10 px-4 outline-none focus:border-white/25"
            placeholder="مثال: جاسم البطيني"
            autoComplete="name"
            disabled={loading}
          />
        </div>

        <div>
          <label className="block text-sm text-white/70 mb-2">رقم الهاتف</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full h-11 rounded-xl bg-[#0F172A] border border-white/10 px-4 outline-none focus:border-white/25"
            placeholder="+965 XXXXXXXX"
            autoComplete="tel"
            type="tel"
            dir="ltr"
            disabled={loading}
          />
        </div>

        {!isInviteFlow && (
          <div>
            <label className="block text-sm text-white/70 mb-2">
              اسم الأكاديمية <span className="text-red-400">*</span>
            </label>
            <input
              value={academyName}
              onChange={(e) => setAcademyName(e.target.value)}
              className="w-full h-11 rounded-xl bg-[#0F172A] border border-white/10 px-4 outline-none focus:border-white/25"
              placeholder="مثال: أكاديمية السالمية الرياضية"
              disabled={loading}
            />
            <p className="mt-1 text-xs text-white/40">
              الاسم قابل للتعديل لاحقاً من الإعدادات.
            </p>
          </div>
        )}

        <hr className="border-white/10" />

        <div>
          <label className="block text-sm text-white/70 mb-2">
            البريد الإلكتروني <span className="text-red-400">*</span>
          </label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full h-11 rounded-xl bg-[#0F172A] border border-white/10 px-4 outline-none focus:border-white/25"
            placeholder="email@example.com"
            autoComplete="email"
            type="email"
            dir="ltr"
            disabled={loading}
          />
        </div>

        <div>
          <label className="block text-sm text-white/70 mb-2">
            كلمة المرور <span className="text-red-400">*</span>
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full h-11 rounded-xl bg-[#0F172A] border border-white/10 px-4 outline-none focus:border-white/25"
            placeholder="6 أحرف على الأقل"
            autoComplete="new-password"
            dir="ltr"
            disabled={loading}
          />
        </div>

        {err && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {err}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full h-11 rounded-xl bg-emerald-500/80 hover:bg-emerald-500 transition font-semibold disabled:opacity-60"
        >
          {loading
            ? "جاري الإنشاء..."
            : isInviteFlow
            ? "إنشاء الحساب"
            : "إنشاء الحساب والأكاديمية"}
        </button>

        <p className="text-sm text-white/60 text-center">
          لديك حساب؟{" "}
          <a
            href={isInviteFlow ? `/login?next=/invite/${inviteToken}` : "/login"}
            className="text-emerald-400 hover:underline"
          >
            سجّل دخول
          </a>
        </p>
      </form>
    </div>
  );
}
