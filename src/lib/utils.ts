/**
 * Shared utilities — imported by page components to avoid duplication.
 */

// ── Error formatting ───────────────────────────────────────────────────────────

/** Converts any thrown value to a human-readable Arabic error string. */
export function formatError(e: unknown): string {
  if (!e) return "خطأ غير محدد";
  if (e instanceof Error) return e.message;
  if (typeof e === "object") {
    const pg = e as Record<string, unknown>;
    const parts: string[] = [];
    if (pg.message) parts.push(`message: ${pg.message}`);
    if (pg.code)    parts.push(`code: ${pg.code}`);
    if (pg.details) parts.push(`details: ${pg.details}`);
    if (pg.hint)    parts.push(`hint: ${pg.hint}`);
    if (parts.length) return parts.join(" | ");
    return JSON.stringify(e);
  }
  return String(e);
}

// ── Date conversion helpers ────────────────────────────────────────────────────

/** "2024-03-15" → "15/03/2024" */
export function isoToDDMMYYYY(iso: string): string {
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  const [yyyy, mm, dd] = parts;
  return `${dd}/${mm}/${yyyy}`;
}

/** "15/03/2024" → "2024-03-15" */
export function ddmmyyyyToISO(ddmmyyyy: string): string {
  const parts = ddmmyyyy.split("/");
  if (parts.length !== 3) return "";
  const [dd, mm, yyyy] = parts;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

/** "2024-03-15" → Date (local midnight, no timezone shift) */
export function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Date → "2024-03-15" */
export function dateToISO(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** "15/03/2024" → Date or null */
export function ddmmyyyyToDate(ddmmyyyy: string): Date | null {
  const parts = ddmmyyyy.split("/");
  if (parts.length !== 3) return null;
  const [dd, mm, yyyy] = parts.map(Number);
  if (!dd || !mm || !yyyy) return null;
  const d = new Date(yyyy, mm - 1, dd);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Date → "15/03/2024" */
export function formatDDMMYYYYFromDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/** Returns a new Date offset by `days` calendar days. */
export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Adds `months` calendar months, clamping to the last valid day of the target month.
 * e.g. Jan 31 + 1 month → Feb 28/29.
 */
export function addMonthsClamped(date: Date, months: number): Date {
  const y = date.getFullYear();
  const m = date.getMonth();
  const day = date.getDate();
  const targetFirst = new Date(y, m + months, 1);
  const lastDay = new Date(
    targetFirst.getFullYear(),
    targetFirst.getMonth() + 1,
    0
  ).getDate();
  return new Date(
    targetFirst.getFullYear(),
    targetFirst.getMonth(),
    Math.min(day, lastDay)
  );
}

// ── Arabic day mapping ─────────────────────────────────────────────────────────

/** Arabic day name → JS getDay() number (0=Sun … 6=Sat) */
export const AR_DAY_TO_JS: Record<string, number> = {
  الأحد:     0,
  الاثنين:   1,
  "الإثنين": 1,
  الثلاثاء:  2,
  الأربعاء:  3,
  الخميس:    4,
  الجمعة:    5,
  السبت:     6,
};

// ── Arabic month labels ────────────────────────────────────────────────────────

/** Ordered array of Arabic month names (index 0 = January). */
export const ARABIC_MONTHS = [
  "يناير", "فبراير", "مارس",    "أبريل",
  "مايو",  "يونيو",  "يوليو",   "أغسطس",
  "سبتمبر","أكتوبر", "نوفمبر",  "ديسمبر",
];

/** "2024-03" → "مارس 2024" */
export function formatMonthArabic(yyyyMM: string): string {
  const [y, m] = yyyyMM.split("-");
  return `${ARABIC_MONTHS[Number(m) - 1] ?? m} ${y}`;
}

/** "2024-03-15" → Arabic long date string */
export function formatDateArabic(iso: string): string {
  try {
    return new Date(iso + "T12:00:00").toLocaleDateString("ar-KW", {
      year: "numeric", month: "long", day: "numeric",
    });
  } catch { return iso; }
}
