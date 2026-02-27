import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // ── Server Actions must NEVER be redirected ────────────────────────────────
  // Next.js Server Actions are POST requests carrying the "next-action" header.
  // Returning a redirect (307/308) instead of an action response causes the
  // client to throw "An unexpected response was received from the server."
  if (request.headers.has("next-action")) {
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data } = await supabase.auth.getUser();
  const user     = data.user;
  const pathname = request.nextUrl.pathname;

  // ── Protected routes (auth required) ──────────────────────────────────────
  const isProtected =
    pathname.startsWith("/dashboard")  ||
    pathname.startsWith("/players")    ||
    pathname.startsWith("/branches")   ||
    pathname.startsWith("/staff")      ||
    pathname.startsWith("/finance")    ||
    pathname.startsWith("/settings")   ||
    pathname.startsWith("/insights")   ||
    pathname.startsWith("/statistics") ||
    pathname.startsWith("/calendar");

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from auth pages
  if (user && (pathname === "/login" || pathname === "/register")) {
    const hasInvite = request.nextUrl.searchParams.has("invite");
    if (!hasInvite) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
  }

  // Redirect /onboarding → /dashboard
  if (pathname.startsWith("/onboarding")) {
    const url = request.nextUrl.clone();
    url.pathname = user ? "/dashboard" : "/register";
    return NextResponse.redirect(url);
  }

  // Role-based redirects were removed from middleware.
  // RLS is the authoritative security layer — unauthorised users get empty data,
  // not a redirect. The DB round-trip here per navigation was a primary source
  // of the 4–5 s latency; removing it brings middleware back to a single
  // auth.getUser() call (~300 ms) with no extra DB queries.

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
