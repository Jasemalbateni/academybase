import { createBrowserClient } from "@supabase/ssr";

// ── Singleton browser client ──────────────────────────────────────────────────
//
// iOS Safari's Navigator.locks API raises a 10-second timeout when multiple
// concurrent callers wait on the same 'lock:sb-*-auth-token' lock.  The lock
// is held internally by @supabase/auth-js while it refreshes the access token.
// If several React components simultaneously call supabase.auth.getSession()
// (Sidebar + page data fetchers + resolveAcademyId inside each lib function),
// and a token refresh is triggered during that window, every waiter races the
// 10 s deadline — which iOS Safari's strict lock implementation will hit when
// the tab has been backgrounded even briefly.
//
// Solution: guarantee exactly ONE SupabaseClient instance in the browser.
//
// @supabase/ssr ≥ 0.8 already maintains a cachedBrowserClient internally, but:
//   • We pass `isSingleton: true` explicitly so the library-level cache is
//     always activated, regardless of how isBrowser() resolves at call-time.
//   • We also hold our own module-level reference so the instance is stable
//     even if bundler chunk-splitting ever produces two copies of the SSR pkg.
//
// On the server (SSR / React Server Components / Server Actions):
//   • navigator.locks is absent in Node → no lock contention can occur.
//   • Module state is shared across simultaneous SSR requests → we MUST NOT
//     use the singleton there (it would leak one user's session to another).
//   • We set isSingleton: false to prevent the library from touching its own
//     cachedBrowserClient on the server path.

let _browserClient: ReturnType<typeof createBrowserClient> | undefined;

export function createClient() {
  if (typeof window === "undefined") {
    // ── Server context ────────────────────────────────────────────────────
    // No navigator.locks → no timeout risk.
    // Fresh instance per call → no cross-request session leakage.
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { isSingleton: false }
    );
  }

  // ── Browser context ───────────────────────────────────────────────────────
  // Return the single shared instance on every call.
  // All lib functions (branches, players, payments, …) and all React components
  // share this one client, so there is only ever one lock-holder at a time.
  if (!_browserClient) {
    _browserClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { isSingleton: true }
    );
  }
  return _browserClient;
}
