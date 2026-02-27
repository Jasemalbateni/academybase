"use server";

import { createClient } from "../../src/lib/supabase/server";

type SetupResult = { error?: string };

/**
 * Called from the register page after supabase.auth.signUp() succeeds and
 * returns a session. Creates the academy, profile, and membership atomically
 * (best-effort sequence — Supabase free tier has no transactions).
 *
 * The server client reads the user's JWT from cookies set by the browser
 * client's signUp() call, so RLS passes without a service-role key.
 *
 * IMPORTANT: middleware.ts must not redirect requests carrying the
 * "next-action" header — doing so would prevent this action from running
 * and cause "An unexpected response from the server" on the client.
 */
export async function setupAcademyAction(
  fullName: string,
  phone: string,
  academyName: string
): Promise<SetupResult> {
  try {
    const trimName = fullName.trim();
    const trimAcademy = academyName.trim();

    if (!trimName || !trimAcademy) {
      return { error: "الاسم واسم الأكاديمية مطلوبان" };
    }

    const supabase = await createClient();

    // Verify session is available server-side
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return {
        error: `لم يتم التعرف على الجلسة — حاول تسجيل الدخول مجدداً${authErr ? ` (${authErr.message})` : ""}`,
      };
    }

    const userId = user.id;

    // 1) Create academy — owner_id = current user
    const { data: academy, error: aErr } = await supabase
      .from("academies")
      .insert({ name: trimAcademy, owner_id: userId })
      .select("id")
      .single();

    if (aErr || !academy) {
      return {
        error: `فشل إنشاء الأكاديمية: ${aErr?.message ?? "خطأ غير معروف"}`,
      };
    }

    const academyId = academy.id as string;

    // 2) Create / update profile (upsert handles retries after partial failure)
    const { error: pErr } = await supabase
      .from("profiles")
      .upsert(
        {
          user_id: userId,
          academy_id: academyId,
          full_name: trimName,
          phone: phone.trim(),
        },
        { onConflict: "user_id" }
      );

    if (pErr) {
      return { error: `فشل إنشاء الملف الشخصي: ${pErr.message}` };
    }

    // 3) Create membership row (ignore duplicate — user may have retried)
    const { error: mErr } = await supabase
      .from("academy_members")
      .insert({ academy_id: academyId, user_id: userId, role: "owner" });

    if (mErr && mErr.code !== "23505") {
      // 23505 = unique_violation → row already exists, safe to ignore
      return { error: `فشل إنشاء العضوية: ${mErr.message}` };
    }

    return {};
  } catch (e) {
    // Catch any unexpected throws so the client always receives a
    // serializable { error } object instead of an "unexpected response".
    console.error("[setupAcademyAction] unhandled error:", e);
    return {
      error: e instanceof Error ? e.message : "خطأ غير متوقع أثناء إعداد الأكاديمية",
    };
  }
}

/**
 * Called when registering via an invitation link (/register?invite=TOKEN).
 * Creates only a profile (no academy, no academy_members row).
 * The invitation acceptance step (acceptInvitationAction) handles the rest.
 */
export async function setupInvitedUserAction(
  fullName: string,
  phone: string
): Promise<SetupResult> {
  try {
    const trimName = fullName.trim();

    const supabase = await createClient();

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return { error: "لم يتم التعرف على الجلسة — حاول مجدداً" };
    }

    // Create profile without academy_id — will be set on invitation acceptance
    const { error: pErr } = await supabase
      .from("profiles")
      .upsert(
        {
          user_id: user.id,
          full_name: trimName || user.email?.split("@")[0] || "—",
          phone: phone.trim(),
        },
        { onConflict: "user_id" }
      );

    if (pErr) {
      return { error: `فشل إنشاء الملف الشخصي: ${pErr.message}` };
    }

    return {};
  } catch (e) {
    console.error("[setupInvitedUserAction] unhandled error:", e);
    return {
      error: e instanceof Error ? e.message : "خطأ غير متوقع",
    };
  }
}
