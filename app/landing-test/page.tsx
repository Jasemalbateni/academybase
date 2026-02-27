import type { ReactNode } from "react";
import Link from "next/link";
import { Tajawal } from "next/font/google";

const tajawal = Tajawal({
  subsets: ["arabic"],
  weight: ["400", "500", "700", "800"],
  display: "swap",
});

// ── SVG icon components ───────────────────────────────────────────────────────

function IconUsers() {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  );
}

function IconMoney() {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
    </svg>
  );
}

function IconBuilding() {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H18v-.008zm0 2.25h.008v.008H18V15z" />
    </svg>
  );
}

function IconChart() {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  );
}

function IconSpark() {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      className="w-4 h-4 text-[#63C0B0] shrink-0 mt-0.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

// ── Dashboard mockup — already uses real app dark tokens ──────────────────────

function DashboardMockup() {
  const bars = [40, 60, 45, 75, 55, 85, 65, 90, 72, 80, 68, 95];
  const rows = ["محمد ع.", "فاطمة أ.", "عبدالله خ."];

  return (
    <div className="w-full max-w-[400px] bg-[#111827] rounded-2xl overflow-hidden border border-white/10 shadow-[0_30px_70px_rgba(0,0,0,0.6)] rotate-1 hover:rotate-0 transition-transform duration-500">
      {/* Browser chrome */}
      <div className="bg-[#0d1520] px-4 py-2.5 flex items-center gap-3">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
        </div>
        <div className="flex-1 bg-white/5 rounded text-[10px] text-white/25 px-3 py-0.5 text-center truncate">
          academybase.app/dashboard
        </div>
      </div>

      {/* App body */}
      <div className="flex" style={{ height: 290 }}>
        {/* Sidebar strip */}
        <div className="w-12 bg-[#0d1520] flex flex-col items-center py-3 gap-3 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-[#63C0B0]/20 flex items-center justify-center text-[#63C0B0] text-xs font-bold">
            A
          </div>
          <div className="w-full px-2 space-y-2 mt-1">
            {[1, 0, 0, 0, 0, 0].map((active, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full ${active ? "bg-[#63C0B0]/70" : "bg-white/10"}`}
              />
            ))}
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 p-3 space-y-3 overflow-hidden">
          <div className="h-2.5 w-24 bg-white/20 rounded-full" />

          {/* KPI cards */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { v: "156", l: "لاعب", c: "text-[#63C0B0]" },
              { v: "12.5k", l: "ريال", c: "text-emerald-400" },
              { v: "4", l: "فروع", c: "text-blue-400" },
            ].map((k) => (
              <div key={k.l} className="bg-white/5 rounded-lg p-2">
                <div className={`text-sm font-bold ${k.c}`}>{k.v}</div>
                <div className="text-white/35 text-[9px] mt-0.5">{k.l}</div>
              </div>
            ))}
          </div>

          {/* Bar chart */}
          <div className="bg-white/5 rounded-lg p-2.5">
            <div className="text-white/40 text-[9px] mb-2">الإيرادات الشهرية</div>
            <div className="flex items-end gap-0.5 h-10">
              {bars.map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-sm"
                  style={{
                    height: `${h}%`,
                    backgroundColor: i >= 10 ? "#63C0B0" : "rgba(99,192,176,0.25)",
                  }}
                />
              ))}
            </div>
          </div>

          {/* Player rows */}
          <div className="bg-white/5 rounded-lg p-2.5 space-y-2">
            <div className="text-white/40 text-[9px] mb-1">آخر الاشتراكات</div>
            {rows.map((name, i) => (
              <div key={name} className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-[#63C0B0]/20 flex items-center justify-center text-[#63C0B0] text-[8px] font-bold shrink-0">
                  {name[0]}
                </div>
                <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#63C0B0]/50 rounded-full"
                    style={{ width: `${72 - i * 14}%` }}
                  />
                </div>
                <div className="text-emerald-400/60 text-[8px] shrink-0">نشط</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Feature card — dark surface matching dashboard cards ──────────────────────

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-white/5 rounded-2xl p-6 border border-white/10 hover:border-white/15 hover:shadow-[0_10px_30px_rgba(0,0,0,0.25)] transition-all duration-300 group">
      <div className="w-12 h-12 rounded-xl bg-[#63C0B0]/15 text-[#63C0B0] flex items-center justify-center mb-4 group-hover:bg-[#63C0B0]/25 transition-colors duration-300">
        {icon}
      </div>
      <h3 className="font-bold text-white text-lg mb-2">{title}</h3>
      <p className="text-white/60 text-sm leading-relaxed">{description}</p>
    </div>
  );
}

// ── Pricing card — all dark; featured emphasized with teal border ─────────────

function PricingCard({
  name,
  price,
  period,
  description,
  features,
  cta,
  href,
  highlighted,
}: {
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  cta: string;
  href: string;
  highlighted: boolean;
}) {
  return (
    <div
      className={[
        "rounded-2xl p-7 border transition-all duration-300",
        highlighted
          ? "bg-white/5 border-[#63C0B0]/40 shadow-[0_10px_30px_rgba(99,192,176,0.12)] md:scale-105"
          : "bg-white/5 border-white/10 hover:border-white/15 hover:shadow-[0_10px_30px_rgba(0,0,0,0.25)]",
      ].join(" ")}
    >
      {highlighted && (
        <span className="inline-block bg-[#63C0B0]/20 text-[#63C0B0] text-xs font-bold px-3 py-1 rounded-full mb-4 border border-[#63C0B0]/30">
          الأكثر شعبية
        </span>
      )}
      <p className="text-sm mb-1 text-white/60">{name}</p>
      <div className="flex items-baseline gap-1 mb-1">
        <span className="text-3xl font-extrabold text-white">{price}</span>
        {period && <span className="text-sm text-white/50">{period}</span>}
      </div>
      <p className="text-sm mb-6 text-white/50">{description}</p>
      <ul className="space-y-2.5 mb-8">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm">
            <CheckIcon />
            <span className="text-white/70">{f}</span>
          </li>
        ))}
      </ul>
      {/* Button styles match Button.tsx exactly: primary = emerald, secondary = white/10 */}
      <Link
        href={href}
        className={[
          "block text-center font-semibold px-6 py-3 rounded-xl transition text-sm",
          highlighted
            ? "bg-emerald-500/80 hover:bg-emerald-500 text-white"
            : "bg-white/10 hover:bg-white/15 text-white/80",
        ].join(" ")}
      >
        {cta}
      </Link>
    </div>
  );
}

// ── Testimonial card — dark surface ──────────────────────────────────────────

function TestimonialCard({
  quote,
  name,
  role,
  initial,
}: {
  quote: string;
  name: string;
  role: string;
  initial: string;
}) {
  return (
    <div className="bg-white/5 rounded-2xl p-6 border border-white/10 hover:border-white/15 transition-all duration-300">
      <svg className="w-7 h-7 text-[#63C0B0]/40 mb-3" fill="currentColor" viewBox="0 0 24 24">
        <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
      </svg>
      <p className="text-white/70 text-sm leading-loose mb-5">"{quote}"</p>
      <div className="flex items-center gap-3">
        {/* Avatar matches sidebar avatar style: bg-[#63C0B0]/20 text-[#63C0B0] */}
        <div className="w-9 h-9 rounded-full bg-[#63C0B0]/20 flex items-center justify-center text-[#63C0B0] text-sm font-bold shrink-0">
          {initial}
        </div>
        <div>
          <div className="font-semibold text-white text-sm">{name}</div>
          <div className="text-white/55 text-xs">{role}</div>
        </div>
      </div>
    </div>
  );
}

// ── Static data ───────────────────────────────────────────────────────────────

const FEATURES: { icon: ReactNode; title: string; description: string }[] = [
  {
    icon: <IconUsers />,
    title: "إدارة اللاعبين",
    description:
      "سجّل بيانات اللاعبين، تتبّع الاشتراكات والتجديدات، وأدِر سجلات الحضور بكل سهولة.",
  },
  {
    icon: <IconMoney />,
    title: "الإدارة المالية",
    description:
      "راقب الإيرادات والمصروفات، وأنشئ تقارير مالية تفصيلية مع تتبع كل دفعة بدقة.",
  },
  {
    icon: <IconBuilding />,
    title: "إدارة الفروع",
    description: "أدِر فروع متعددة من مكان واحد مع صلاحيات مخصصة لكل مدير فرع.",
  },
  {
    icon: <IconCalendar />,
    title: "التقويم والجداول",
    description:
      "نظّم مواعيد التدريب والمباريات والفعاليات مع عرض تقويمي سهل الاستخدام.",
  },
  {
    icon: <IconChart />,
    title: "إحصائيات متقدمة",
    description:
      "لوحة تحكم ذكية بمخططات بيانية تفاعلية تمنحك رؤية شاملة لأداء أكاديميتك.",
  },
  {
    icon: <IconSpark />,
    title: "التنبيهات الذكية",
    description:
      "يرصد النظام تلقائياً الاشتراكات المنتهية والغياب المتكرر لمساعدتك على التصرف بسرعة.",
  },
];

const PLANS = [
  {
    name: "الأساسية",
    price: "مجاناً",
    period: "",
    description: "مثالية للأكاديميات الصغيرة التي تبدأ رحلتها",
    features: ["حتى 50 لاعب", "فرع واحد", "تقارير أساسية", "دعم عبر البريد الإلكتروني"],
    cta: "ابدأ مجاناً",
    href: "/register",
    highlighted: false,
  },
  {
    name: "الاحترافية",
    price: "199",
    period: "ريال / شهر",
    description: "للأكاديميات النامية التي تحتاج قدرات أكبر",
    features: [
      "لاعبون غير محدودون",
      "حتى 5 فروع",
      "تقارير مالية متقدمة",
      "تنبيهات ذكية",
      "إدارة الطاقم",
      "دعم الأولوية",
    ],
    cta: "ابدأ التجربة",
    href: "/register",
    highlighted: true,
  },
  {
    name: "المؤسسية",
    price: "تواصل معنا",
    period: "",
    description: "لأكاديميات الاتحادات والمجموعات الكبيرة",
    features: [
      "فروع غير محدودة",
      "تكاملات مخصصة",
      "مدير حساب مخصص",
      "تدريب الفريق",
      "SLA مضمون",
      "دعم على مدار الساعة",
    ],
    cta: "تواصل معنا",
    href: "/register",
    highlighted: false,
  },
];

const TESTIMONIALS = [
  {
    quote:
      "AcademyBase غيّرت طريقة إدارتنا بالكامل. كنا نعمل بالورق وجداول Excel، والآن كل شيء منظّم في مكان واحد.",
    name: "أحمد الزهراني",
    role: "مدير أكاديمية الرياضة الخليجية",
    initial: "أ",
  },
  {
    quote:
      "التقارير المالية التلقائية وفّرت علينا ساعات من العمل كل أسبوع. الدقة والوضوح رائعان.",
    name: "سارة المنصور",
    role: "مديرة أكاديمية الأبطال الصغار",
    initial: "س",
  },
  {
    quote:
      "الدعم الفني سريع الاستجابة والمنصة سهلة الاستخدام حتى للموظفين الجدد. أنصح بها بشدة.",
    name: "خالد العتيبي",
    role: "مالك نادي المستقبل الرياضي",
    initial: "خ",
  },
];

// ── Page component ────────────────────────────────────────────────────────────

export default function LandingTestPage() {
  const year = new Date().getFullYear();

  return (
    // bg-[#0B1220]: canonical page base from app/(app)/layout.tsx
    <div dir="rtl" className={`${tajawal.className} bg-[#0B1220] text-white`}>

      {/* ── Header — bg-[#111827] matches sidebar/header surface ── */}
      <header className="sticky top-0 z-50 bg-[#111827]/95 backdrop-blur-sm border-b border-white/10">
        <div className="max-w-6xl mx-auto px-5 py-4 flex items-center justify-between gap-4">

          {/* Logo — matches sidebar logo: bg-[#63C0B0]/20 text-[#63C0B0] */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-9 h-9 rounded-xl bg-[#63C0B0]/20 flex items-center justify-center text-[#63C0B0] font-extrabold text-sm shrink-0">
              A
            </div>
            <span className="font-bold text-lg text-white">AcademyBase</span>
          </div>

          {/* Nav — text-white/60 matches sidebar inactive nav items */}
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-white/60">
            <a href="#features" className="hover:text-[#63C0B0] transition-colors">
              المميزات
            </a>
            <a href="#pricing" className="hover:text-[#63C0B0] transition-colors">
              الأسعار
            </a>
            <a href="#testimonials" className="hover:text-[#63C0B0] transition-colors">
              آراء العملاء
            </a>
          </nav>

          {/* Auth buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Secondary — Button.tsx secondary: bg-white/10 hover:bg-white/15 */}
            <Link
              href="/login"
              className="hidden sm:inline-flex items-center justify-center text-sm font-semibold bg-white/10 hover:bg-white/15 text-white/80 px-4 h-9 rounded-xl transition"
            >
              تسجيل الدخول
            </Link>
            {/* Primary — Button.tsx primary: bg-emerald-500/80 hover:bg-emerald-500 */}
            <Link
              href="/register"
              className="inline-flex items-center justify-center text-sm font-semibold bg-emerald-500/80 hover:bg-emerald-500 text-white px-5 h-9 rounded-xl transition"
            >
              ابدأ مجاناً
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero — bg-[#0B1220] base + soft teal radial glows ── */}
      <section className="relative overflow-hidden bg-[#0B1220]">
        {/* Subtle teal glow blobs — replaces the bright marketing gradient */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          <div className="absolute -top-60 -right-40 w-[600px] h-[600px] rounded-full bg-[#63C0B0]/10 blur-3xl" />
          <div className="absolute bottom-0 left-0 w-96 h-96 rounded-full bg-[#63C0B0]/5 blur-3xl" />
          <div className="absolute top-1/3 left-1/4 w-64 h-64 rounded-full bg-white/[0.02] blur-2xl" />
        </div>

        <div className="relative max-w-6xl mx-auto px-5 py-20 md:py-28 flex flex-col md:flex-row items-center gap-14">
          {/* RIGHT (first in RTL flex-row): Text */}
          <div className="flex-1 space-y-6 text-center md:text-right">

            {/* Pill badge — bg-white/5 border-white/10 matching dashboard insight badges */}
            <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 text-sm text-[#63C0B0] font-medium">
              <span className="w-2 h-2 rounded-full bg-[#63C0B0] animate-pulse inline-block" />
              منصة إدارة الأكاديميات الرياضية الأولى في الخليج
            </div>

            <h1 className="text-4xl md:text-5xl font-extrabold leading-snug tracking-tight text-white">
              أدِر أكاديميتك الرياضية
              <br />
              <span className="text-[#63C0B0]">بذكاء واحترافية</span>
            </h1>

            <p className="text-lg text-white/70 leading-relaxed max-w-lg mx-auto md:mx-0">
              منصة متكاملة لإدارة اللاعبين، المدفوعات، الحضور، والفروع — كل ما تحتاجه في مكان
              واحد مع تقارير ذكية تساعدك على اتخاذ قرارات أفضل.
            </p>

            <div className="flex flex-wrap gap-3 justify-center md:justify-start">
              {/* Primary CTA — Button.tsx primary */}
              <Link
                href="/register"
                className="inline-flex items-center justify-center bg-emerald-500/80 hover:bg-emerald-500 text-white font-semibold px-8 h-11 rounded-xl transition text-sm"
              >
                ابدأ الآن — مجاناً
              </Link>
              {/* Secondary CTA — Button.tsx secondary */}
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center bg-white/10 hover:bg-white/15 text-white/80 font-semibold px-8 h-11 rounded-xl transition text-sm"
              >
                الانتقال إلى النظام
              </Link>
            </div>

            {/* Trust badges — text-white/45 matches muted text */}
            <div className="flex flex-wrap items-center gap-5 justify-center md:justify-start pt-1 text-sm text-white/45">
              {["بدون بطاقة ائتمانية", "إعداد في دقيقتين", "دعم فني دائم"].map((badge) => (
                <span key={badge} className="flex items-center gap-1.5">
                  <svg
                    className="w-4 h-4 text-[#63C0B0] shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  {badge}
                </span>
              ))}
            </div>
          </div>

          {/* LEFT (second in RTL flex-row): Mockup */}
          <div className="flex-1 flex justify-center md:justify-end">
            <DashboardMockup />
          </div>
        </div>
      </section>

      {/* ── Features — bg-[#0B1220] base, card surfaces bg-white/5 ── */}
      <section id="features" className="py-20 bg-[#0B1220] border-t border-white/[0.04]">
        <div className="max-w-6xl mx-auto px-5">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">
              كل ما تحتاجه في منصة واحدة
            </h2>
            <p className="text-white/60 text-lg max-w-2xl mx-auto">
              مُصممة خصيصاً لأكاديميات الرياضة في منطقة الخليج العربي
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f) => (
              <FeatureCard key={f.title} icon={f.icon} title={f.title} description={f.description} />
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA — bg-[#111827] elevated surface with border-y ── */}
      <section className="bg-[#111827] border-y border-white/10 py-16">
        <div className="max-w-3xl mx-auto px-5 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">جاهز لتحويل أكاديميتك؟</h2>
          <p className="text-white/60 text-lg mb-8">
            انضم إلى مئات الأكاديميات التي تثق في AcademyBase لإدارة عملياتها يومياً.
          </p>
          {/* Primary CTA — Button.tsx primary */}
          <Link
            href="/register"
            className="inline-flex items-center justify-center bg-emerald-500/80 hover:bg-emerald-500 text-white font-semibold px-12 h-11 rounded-xl transition text-sm"
          >
            ابدأ تجربتك المجانية الآن
          </Link>
        </div>
      </section>

      {/* ── Pricing — bg-[#0B1220], card surfaces bg-white/5 ── */}
      <section id="pricing" className="py-20 bg-[#0B1220] border-t border-white/[0.04]">
        <div className="max-w-6xl mx-auto px-5">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">
              خطط بسيطة وشفافة
            </h2>
            <p className="text-white/60 text-lg">اختر الخطة المناسبة لحجم أكاديميتك</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center">
            {PLANS.map((p) => (
              <PricingCard key={p.name} {...p} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials — bg-[#111827] alternates with base ── */}
      <section id="testimonials" className="py-20 bg-[#111827] border-t border-white/10">
        <div className="max-w-6xl mx-auto px-5">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">
              ماذا يقول عملاؤنا
            </h2>
            <p className="text-white/60 text-lg">آراء حقيقية من مدراء أكاديميات رياضية</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t) => (
              <TestimonialCard key={t.name} {...t} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer — bg-[#111827] matches sidebar/header surface ── */}
      <footer className="bg-[#111827] border-t border-white/10 py-12">
        <div className="max-w-6xl mx-auto px-5">
          <div className="flex flex-col md:flex-row justify-between gap-10 mb-10">
            {/* Brand */}
            <div className="space-y-3 max-w-xs">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-[#63C0B0]/20 flex items-center justify-center text-[#63C0B0] font-extrabold text-sm shrink-0">
                  A
                </div>
                <span className="font-bold text-xl text-white">AcademyBase</span>
              </div>
              <p className="text-white/45 text-sm leading-relaxed">
                منصة متكاملة لإدارة الأكاديميات الرياضية في العالم العربي.
              </p>
            </div>

            {/* Links */}
            <div className="grid grid-cols-2 gap-x-20 gap-y-3 text-sm text-white/55">
              <a href="#features" className="hover:text-white transition-colors">
                المميزات
              </a>
              <Link href="/login" className="hover:text-white transition-colors">
                تسجيل الدخول
              </Link>
              <a href="#pricing" className="hover:text-white transition-colors">
                الأسعار
              </a>
              <Link href="/register" className="hover:text-white transition-colors">
                إنشاء حساب
              </Link>
              <a href="#testimonials" className="hover:text-white transition-colors">
                آراء العملاء
              </a>
              <Link href="/dashboard" className="hover:text-white transition-colors">
                لوحة التحكم
              </Link>
            </div>
          </div>

          <div className="border-t border-white/10 pt-8 flex flex-col sm:flex-row justify-between items-center gap-3 text-sm text-white/35">
            <span>&copy; {year} AcademyBase. جميع الحقوق محفوظة.</span>
            <span>صُنع بـ ♥ للأكاديميات الرياضية العربية</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
