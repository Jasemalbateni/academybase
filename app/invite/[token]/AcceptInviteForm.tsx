"use client";

import { useState } from "react";
import { acceptInvitationAction } from "../actions";

type Props = {
  token: string;
  targetEmail: string;
  currentUserEmail: string | null;
  isAuthenticated: boolean;
};

export default function AcceptInviteForm({
  token,
  targetEmail,
  currentUserEmail,
  isAuthenticated,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const emailMatches =
    isAuthenticated &&
    currentUserEmail?.toLowerCase() === targetEmail.toLowerCase();

  async function handleAccept() {
    setLoading(true);
    setErr(null);
    try {
      const result = await acceptInvitationAction(token);
      if (result.error) {
        setErr(result.error);
        return;
      }
      // Hard navigation: clears cached state and lands on dashboard
      window.location.replace("/dashboard");
    } finally {
      setLoading(false);
    }
  }

  // ── Not authenticated ──────────────────────────────────────────────────────
  if (!isAuthenticated) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-white/70 text-center">
          يرجى تسجيل الدخول أو إنشاء حساب بالبريد{" "}
          <span className="text-emerald-300 font-semibold">{targetEmail}</span>{" "}
          للمتابعة.
        </p>
        <a
          href={`/login?next=/invite/${token}`}
          className="flex items-center justify-center w-full h-11 rounded-xl bg-emerald-500/80 hover:bg-emerald-500 font-semibold transition"
        >
          تسجيل الدخول
        </a>
        <a
          href={`/register?invite=${token}`}
          className="flex items-center justify-center w-full h-11 rounded-xl bg-white/10 hover:bg-white/15 font-semibold transition"
        >
          إنشاء حساب جديد
        </a>
      </div>
    );
  }

  // ── Wrong email ────────────────────────────────────────────────────────────
  if (!emailMatches) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 text-center space-y-1">
          <p>
            أنت مسجّل الدخول بالبريد{" "}
            <strong>{currentUserEmail}</strong>.
          </p>
          <p>
            هذه الدعوة مخصصة لـ{" "}
            <strong>{targetEmail}</strong>.
          </p>
          <p>يرجى تسجيل الدخول بالبريد الصحيح.</p>
        </div>
        <a
          href="/login"
          className="flex items-center justify-center w-full h-11 rounded-xl bg-white/10 hover:bg-white/15 font-semibold transition"
        >
          تسجيل الدخول بحساب آخر
        </a>
      </div>
    );
  }

  // ── Ready to accept ────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {err && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {err}
        </div>
      )}
      <button
        onClick={handleAccept}
        disabled={loading}
        className="w-full h-11 rounded-xl bg-emerald-500/80 hover:bg-emerald-500 font-semibold transition disabled:opacity-60"
      >
        {loading ? "جاري القبول..." : "قبول الدعوة والانضمام"}
      </button>
    </div>
  );
}
