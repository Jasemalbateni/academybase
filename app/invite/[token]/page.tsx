import { createAdminClient } from "../../../src/lib/supabase/admin";
import { createClient } from "../../../src/lib/supabase/server";
import AcceptInviteForm from "./AcceptInviteForm";

type Params = { token: string };

/**
 * Server-rendered invitation acceptance page.
 *
 * Uses the admin (service_role) client to look up the invitation by token —
 * this is safe because the token is a 256-bit random value and is itself
 * the secret. No RLS bypass for sensitive user data occurs here.
 *
 * Then checks if the current session user's email matches the invite.
 */
export default async function InvitePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { token } = await params;

  // ── Read invitation with admin client (bypasses RLS for token lookup) ───────
  type InvRow = {
    id: string;
    email: string;
    role: string;
    expires_at: string;
    accepted_at: string | null;
    academies: { name: string } | null;
  };

  let inv: InvRow | null = null;

  try {
    const adminSupabase = createAdminClient();
    const { data } = await adminSupabase
      .from("invitations")
      .select("id, email, role, expires_at, accepted_at, academies(name)")
      .eq("token", token)
      .maybeSingle();
    inv = data as InvRow | null;
  } catch {
    // Admin client misconfigured (missing env var)
    return (
      <InviteLayout>
        <ErrorPanel reason="خطأ في تهيئة الخادم. تواصل مع الدعم الفني." />
      </InviteLayout>
    );
  }

  if (!inv) {
    return (
      <InviteLayout>
        <ErrorPanel reason="الدعوة غير موجودة أو انتهت صلاحيتها." />
      </InviteLayout>
    );
  }

  if (inv.accepted_at) {
    return (
      <InviteLayout>
        <ErrorPanel reason="تم استخدام هذه الدعوة مسبقاً." />
      </InviteLayout>
    );
  }

  if (new Date(inv.expires_at) < new Date()) {
    return (
      <InviteLayout>
        <ErrorPanel reason="انتهت صلاحية هذه الدعوة (7 أيام منذ الإرسال). اطلب دعوة جديدة من مالك الأكاديمية." />
      </InviteLayout>
    );
  }

  // ── Check current session ─────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const academyName = inv.academies?.name ?? "الأكاديمية";
  const roleLabelMap: Record<string, string> = {
    partner: "شريك",
    branch_manager: "مدير فرع",
    admin_staff: "اداري",
  };
  const roleLabelAr = roleLabelMap[inv.role] ?? inv.role;

  return (
    <InviteLayout>
      <div className="text-center space-y-2">
        <div className="text-5xl">🎓</div>
        <h1 className="text-xl font-bold">دعوة للانضمام</h1>
        <p className="text-white/70">
          تمت دعوتك للانضمام إلى{" "}
          <span className="text-emerald-400 font-semibold">{academyName}</span>{" "}
          كـ{" "}
          <span className="font-semibold text-white">{roleLabelAr}</span>
        </p>
        <p className="text-xs text-white/50">
          البريد المستهدف:{" "}
          <span className="text-white/70">{inv.email}</span>
        </p>
      </div>

      <AcceptInviteForm
        token={token}
        targetEmail={inv.email}
        currentUserEmail={user?.email ?? null}
        isAuthenticated={!!user}
      />
    </InviteLayout>
  );
}

// ── Shared layout wrapper ─────────────────────────────────────────────────────

function InviteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen bg-[#0B1220] text-white flex items-center justify-center p-6"
      dir="rtl"
    >
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-8 space-y-6">
        {children}
      </div>
    </div>
  );
}

function ErrorPanel({ reason }: { reason: string }) {
  return (
    <div className="text-center space-y-4">
      <div className="text-5xl">⚠️</div>
      <p className="text-white/80 font-semibold">{reason}</p>
      <a
        href="/login"
        className="inline-block mt-2 text-emerald-400 hover:underline text-sm"
      >
        العودة إلى تسجيل الدخول
      </a>
    </div>
  );
}
