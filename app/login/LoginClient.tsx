"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

export default function LoginClient() {
  const supabase = createClient();
  const sp = useSearchParams();

  // `next` is used by the invite flow: /login?next=/invite/TOKEN
  // Validate it starts with "/" to prevent open redirects.
  const rawNext = sp.get("next") || "/dashboard";
  const next = rawNext.startsWith("/") ? rawNext : "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setLoading(false);
      setErr(error.message);
      return;
    }

    // Hard navigation — bypasses App Router cache, guarantees URL update.
    // loading intentionally stays true during page unload.
    window.location.replace(next);
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6 bg-[#0B1220]"
      dir="rtl"
    >
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-8 text-white space-y-4"
      >
        <h1 className="text-2xl font-semibold">تسجيل الدخول</h1>

        <div>
          <label className="block text-sm text-white/70 mb-2">
            البريد الإلكتروني
          </label>
          <input
            className="w-full h-11 rounded-xl bg-[#0F172A] border border-white/10 px-4 outline-none focus:border-white/25"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@example.com"
            type="email"
            dir="ltr"
            autoComplete="email"
            disabled={loading}
          />
        </div>

        <div>
          <label className="block text-sm text-white/70 mb-2">كلمة المرور</label>
          <input
            type="password"
            className="w-full h-11 rounded-xl bg-[#0F172A] border border-white/10 px-4 outline-none focus:border-white/25"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
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
          {loading ? "جاري الدخول..." : "دخول"}
        </button>

        <p className="text-sm text-white/60 text-center">
          ليس لديك حساب؟{" "}
          <a className="text-emerald-400 hover:underline" href="/register">
            تسجيل جديد
          </a>
        </p>
      </form>
    </div>
  );
}
