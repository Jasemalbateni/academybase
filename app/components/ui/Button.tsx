import { ButtonHTMLAttributes } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "md" | "sm" | "xs";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

// ── Styles ────────────────────────────────────────────────────────────────────
// primary   — teal/emerald, matches /settings "حفظ" reference button
// secondary — subtle white, for cancel/back actions
// danger    — red tint, for destructive actions (delete)
// ghost     — sky tint, for non-destructive row actions (edit)

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-emerald-500/80 hover:bg-emerald-500 text-white font-semibold disabled:opacity-60",
  secondary:
    "bg-white/10 hover:bg-white/15 text-white/80 font-semibold disabled:opacity-60",
  danger:
    "bg-red-500/15 hover:bg-red-500/25 text-red-300 font-semibold disabled:opacity-60",
  ghost:
    "bg-sky-500/15 hover:bg-sky-500/25 text-sky-200 font-semibold disabled:opacity-60",
};

// md  — header buttons and modal action buttons
// sm  — table-row inline buttons (players, branches)
// xs  — compact table-row buttons (staff, finance)

const SIZE: Record<Size, string> = {
  md: "h-11 px-5 text-sm rounded-xl",
  sm: "h-9 px-4 text-sm rounded-xl",
  xs: "px-3 py-1.5 text-xs rounded-lg",
};

// ── Component ─────────────────────────────────────────────────────────────────

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={[
        "inline-flex items-center justify-center transition",
        VARIANT[variant],
        SIZE[size],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </button>
  );
}
