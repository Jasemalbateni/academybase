import { createClient } from "./supabase/server";

export async function getMyAcademyId() {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("academy_id")
    .eq("user_id", userData.user.id)
    .single();

  if (error) return null;
  return profile?.academy_id ?? null;
}