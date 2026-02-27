"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Onboarding is replaced by the register page.
 * Any link that lands here is redirected to /dashboard.
 */
export default function OnboardingPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0B1220] text-white/60 text-sm">
      جاري التحويل...
    </div>
  );
}
