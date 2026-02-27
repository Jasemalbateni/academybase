import { createClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase admin client using the service_role key.
 * NEVER import this in client components or expose to the browser.
 *
 * Required env var: SUPABASE_SERVICE_ROLE_KEY
 * (set in .env.local — never commit to source control)
 *
 * Used for:
 *   - Reading invitation details by token (bypasses RLS for server-rendered pages)
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY — add it to .env.local\n" +
      "Get it from: Supabase Dashboard → Project Settings → API → service_role"
    );
  }

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
