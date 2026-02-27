"use server";

import { createClient } from "../../src/lib/supabase/server";

export async function createAcademyAction(formData: FormData) {
  const name = String(formData.get("academy_name") || "").trim();
  if (!name) throw new Error("اكتب اسم الأكاديمية");

  const supabase = await createClient();

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) throw new Error("يجب تسجيل الدخول أولاً");

  const user = userData.user;

  // 1) create academy (owner_id lets settings page find it via .eq("owner_id", user.id))
  const { data: academy, error: aErr } = await supabase
    .from("academies")
    .insert({ name, owner_id: user.id })
    .select("id")
    .single();

  if (aErr || !academy) throw new Error(aErr?.message ?? "فشل إنشاء الأكاديمية");

  // 2) add membership owner
  const { error: mErr } = await supabase
    .from("academy_members")
    .insert({ academy_id: academy.id, user_id: user.id, role: "owner" });

  if (mErr) throw new Error(mErr.message);

  // 3) upsert profile link
  const { error: pErr } = await supabase
    .from("profiles")
    .upsert({ user_id: user.id, academy_id: academy.id }, { onConflict: "user_id" });

  if (pErr) throw new Error(pErr.message);

  return { ok: true };
}