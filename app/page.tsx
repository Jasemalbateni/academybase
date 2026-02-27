import Image from "next/image";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[#0B1220] text-white">
      {/* Top Nav */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0B1220]/80 backdrop-blur">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-[#1C2D5A] grid place-items-center font-bold">
              AB
            </div>
            <div className="leading-tight">
              <div className="font-semibold">Academy Base</div>
              <div className="text-xs text-white/60">نظام إدارة الأكاديميات</div>
            </div>
          </div>

          <nav className="flex items-center gap-3">
            <a
              href="/login"
              className="px-4 py-2 rounded-xl border border-white/15 hover:bg-white/5 transition"
            >
              تسجيل دخول
            </a>
            <a
              href="/register"
              className="px-4 py-2 rounded-xl bg-[#63C0B0] text-[#0B1220] font-semibold hover:opacity-90 transition"
            >
              ابدأ الآن
            </a>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute -top-24 -left-24 h-80 w-80 rounded-full bg-[#63C0B0]/20 blur-3xl" />
          <div className="absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-[#1C2D5A]/35 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-6xl px-6 py-14 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-sm text-white/80">
              <span className="h-2 w-2 rounded-full bg-[#63C0B0]" />
              SaaS لإدارة الأكاديميات — عربي (RTL)
            </div>

            <h1 className="mt-4 text-4xl lg:text-5xl font-extrabold leading-tight">
              خلّ الأكاديمية تشتغل{" "}
              <span className="text-[#63C0B0]">بنظام</span>… مو بالاجتهاد
            </h1>

            <p className="mt-4 text-lg text-white/70 leading-relaxed">
              إدارة لاعبين، فروع، تجديدات، قوائم منتهية، طباعة… وكل شيء مرتب وواضح
              لصاحب الأكاديمية.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href="/register"
                className="px-6 py-3 rounded-2xl bg-[#63C0B0] text-[#0B1220] font-semibold hover:opacity-90 transition"
              >
                جرّب الآن
              </a>
              <a
                href="/login"
                className="px-6 py-3 rounded-2xl border border-white/15 hover:bg-white/5 transition font-semibold"
              >
                دخول
              </a>
            </div>

            <div className="mt-7 grid grid-cols-3 gap-3 text-sm">
              <div className="p-3 rounded-2xl bg-white/5 border border-white/10">
                <div className="font-bold">لاعبين</div>
                <div className="text-white/60">ملف واضح + حالة اشتراك</div>
              </div>
              <div className="p-3 rounded-2xl bg-white/5 border border-white/10">
                <div className="font-bold">فروع</div>
                <div className="text-white/60">فلترة + تقارير</div>
              </div>
              <div className="p-3 rounded-2xl bg-white/5 border border-white/10">
                <div className="font-bold">طباعة</div>
                <div className="text-white/60">قائمة اللاعبين بنقرة</div>
              </div>
            </div>
          </div>

          {/* Preview Card */}
          <div className="relative">
            <div className="absolute -inset-4 rounded-[32px] bg-gradient-to-tr from-[#63C0B0]/20 via-white/5 to-[#1C2D5A]/30 blur-2xl" />
            <div className="relative rounded-[28px] border border-white/10 bg-white/5 shadow-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-yellow-400/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-green-400/80" />
                <div className="ml-3 text-xs text-white/60">Preview</div>
              </div>

              {/* إذا ما عندك صور، اترك البلوك هذا. 
                  لو عندك صورة لاحقًا ضعها في public/landing/hero.png وفعّل Image */}
              <div className="p-6">
                <div className="rounded-2xl border border-white/10 bg-[#0B1220]/60 p-5">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-white/70">لوحة التحكم</div>
                    <div className="text-xs text-white/50">Academy Base</div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                      <div className="text-xs text-white/60">لاعبين نشطين</div>
                      <div className="text-2xl font-extrabold mt-1">128</div>
                    </div>
                    <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                      <div className="text-xs text-white/60">تنتهي خلال 7 أيام</div>
                      <div className="text-2xl font-extrabold mt-1 text-[#63C0B0]">14</div>
                    </div>
                    <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                      <div className="text-xs text-white/60">فروع</div>
                      <div className="text-2xl font-extrabold mt-1">3</div>
                    </div>
                    <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                      <div className="text-xs text-white/60">تجديدات اليوم</div>
                      <div className="text-2xl font-extrabold mt-1">6</div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl bg-white/5 border border-white/10 p-4">
                    <div className="text-xs text-white/60 mb-2">ملاحظة</div>
                    <div className="text-sm text-white/75 leading-relaxed">
                      هذا مجرد Preview تصميمي… بعد شوي نربطه ببيانات الأكاديمية من Supabase.
                    </div>
                  </div>
                </div>

                {/* إذا عندك صورة جاهزة فعّل هذا:
                <Image
                  src="/landing/hero.png"
                  alt="Academy Base preview"
                  width={1200}
                  height={800}
                  className="w-full h-auto rounded-2xl"
                  priority
                />
                */}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-6 py-12">
        <h2 className="text-3xl font-extrabold">ليش Academy Base؟</h2>
        <p className="mt-2 text-white/70">
          لأن صاحب الأكاديمية يحتاج “وضوح” يومي — مو شيتات مبعثرة.
        </p>

        <div className="mt-6 grid md:grid-cols-3 gap-4">
          {[
            {
              title: "نظام لاعبين",
              desc: "إضافة/تعديل، تجديد، حالات واضحة، وطباعة قائمة.",
            },
            {
              title: "فروع متعددة",
              desc: "فلتر حسب الفرع + رؤية موحدة لكل الأكاديمية.",
            },
            {
              title: "تقارير قريبة",
              desc: "منتهي/قريب/نشط + تنبيهات انتهاء خلال 7 أيام.",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="p-5 rounded-3xl bg-white/5 border border-white/10"
            >
              <div className="h-10 w-10 rounded-2xl bg-[#63C0B0]/20 border border-[#63C0B0]/30 mb-3" />
              <div className="font-bold">{f.title}</div>
              <div className="mt-2 text-white/70 leading-relaxed">{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-white/10 bg-white/5">
        <div className="mx-auto max-w-6xl px-6 py-12 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div>
            <h3 className="text-2xl font-extrabold">جاهز ترتّب الأكاديمية؟</h3>
            <p className="mt-2 text-white/70">
              أنشئ حسابك الآن وابدأ بإضافة الفروع واللاعبين.
            </p>
          </div>
          <div className="flex gap-3 flex-wrap">
            <a
              href="/register"
              className="px-6 py-3 rounded-2xl bg-[#63C0B0] text-[#0B1220] font-semibold hover:opacity-90 transition"
            >
              ابدأ الآن
            </a>
            <a
              href="/login"
              className="px-6 py-3 rounded-2xl border border-white/15 hover:bg-white/5 transition font-semibold"
            >
              تسجيل دخول
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mx-auto max-w-6xl px-6 py-10 text-sm text-white/50">
        © {new Date().getFullYear()} Academy Base — جميع الحقوق محفوظة
      </footer>
    </main>
  );
}