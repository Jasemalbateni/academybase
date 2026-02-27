import { createClient } from "./browser";

// ── Types ─────────────────────────────────────────────────────────────────────

export type AcademyDiag = {
  userId: string | null;
  profileData: { academy_id: string; full_name?: string } | null;
  profileError: string | null;
  profileBlocked: boolean; // true = data null AND error null → RLS blocking
  resolved: string | null;
  resolvedError: string | null;
};

// ── Canonical resolution ───────────────────────────────────────────────────────
//
// Single source of truth: profiles.academy_id
//
// Why profiles (not academy_members)?
//   branches RLS: branches → profiles → (policy: user_id = auth.uid(), no further joins)
//   If we used academy_members, the chain could become:
//   branches → academy_members → academies → academy_members → ∞ (stack overflow)
//
// Requires RLS policy on profiles:
//   FOR SELECT USING (user_id = auth.uid())   ← direct, no subqueries

export async function resolveAcademyId(): Promise<string> {
  const supabase = createClient();

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    throw new Error("المستخدم غير مسجل الدخول");
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("academy_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error(`خطأ في قراءة الملف الشخصي: ${error.message} [${error.code}]`);
  }

  if (!data?.academy_id) {
    // data null + error null = RLS is blocking; data null with error = Postgres error
    const hint = !error
      ? "لا بيانات ولا خطأ — تحقق من RLS: profiles SELECT policy"
      : "لا يوجد ملف شخصي لهذا المستخدم";
    throw new Error(`لا توجد أكاديمية مرتبطة بهذا الحساب — ${hint}`);
  }

  return data.academy_id as string;
}

// ── Dev diagnostics ───────────────────────────────────────────────────────────

export async function diagnoseAcademy(): Promise<AcademyDiag> {
  const supabase = createClient();

  const diag: AcademyDiag = {
    userId: null,
    profileData: null,
    profileError: null,
    profileBlocked: false,
    resolved: null,
    resolvedError: null,
  };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    diag.resolvedError = "not authenticated";
    return diag;
  }
  diag.userId = user.id;

  const { data: pd, error: pErr } = await supabase
    .from("profiles")
    .select("academy_id, full_name")
    .eq("user_id", user.id)
    .maybeSingle();

  diag.profileData = (pd as AcademyDiag["profileData"]) ?? null;
  diag.profileError = pErr ? `${pErr.message} [${pErr.code}]` : null;
  diag.profileBlocked = !pd && !pErr;

  if (pd?.academy_id) {
    diag.resolved = pd.academy_id as string;
  } else {
    diag.resolvedError = diag.profileBlocked
      ? "profiles RLS is blocking SELECT — run 01_schema_profiles.sql"
      : pErr
      ? `profiles error: ${pErr.message}`
      : "no profiles row found — user must complete registration";
  }

  return diag;
}
