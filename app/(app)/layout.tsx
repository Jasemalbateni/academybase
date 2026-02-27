import Sidebar from "@/app/components/Sidebar";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#0B1220] text-white flex" dir="rtl">
      <Sidebar />
      {children}
    </div>
  );
}
