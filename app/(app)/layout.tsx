"use client";

import { useState } from "react";
import Sidebar from "@/app/components/Sidebar";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#0B1220] text-white flex" dir="rtl">
      {/* Mobile backdrop — click to close sidebar */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <Sidebar
        mobileOpen={sidebarOpen}
        onMobileClose={() => setSidebarOpen(false)}
      />

      {/* Main content wrapper */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Mobile top bar — hidden on md+ */}
        <header className="sticky top-0 z-30 flex items-center justify-between px-4 h-14 bg-[#111827] border-b border-white/10 md:hidden">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition"
            aria-label="فتح القائمة"
          >
            {/* Hamburger icon */}
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="text-sm font-semibold">AcademyBase</span>
          {/* Spacer to keep title centered */}
          <div className="w-9" />
        </header>

        {children}
      </div>
    </div>
  );
}
