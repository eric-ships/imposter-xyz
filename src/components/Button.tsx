"use client";

// The one button. Three variants, three sizes — every actionable
// button in the app routes through this so sizing, radius, weight,
// hover and (keyboard) focus states never drift again.
//
// `buttonClasses` is exported for the one case a <button> can't
// cover: a Next <Link> that should look like a button.

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg" | "xl";

const BASE =
  "inline-flex select-none items-center justify-center gap-2 rounded-full " +
  "font-semibold tracking-tight transition-all duration-100 outline-none " +
  "focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 " +
  "focus-visible:ring-offset-page active:scale-[0.98] " +
  "disabled:pointer-events-none disabled:opacity-40";

const VARIANTS: Record<Variant, string> = {
  // Primary action — one per view. The brand accent, filled.
  primary: "bg-accent text-white shadow-sm hover:shadow-md hover:brightness-110",
  // Secondary — an outline; quieter, no fill.
  secondary:
    "border border-line bg-surface text-ink-soft hover:border-ink hover:text-ink",
  // Ghost — tertiary; no border, a soft hover wash.
  ghost: "text-ink-soft hover:bg-cream hover:text-ink",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 px-3.5 text-sm",
  md: "h-11 px-5 text-sm",
  lg: "h-14 px-6 text-base",
  xl: "h-16 px-8 text-lg",
};

export function buttonClasses(opts?: {
  variant?: Variant;
  size?: Size;
  className?: string;
}): string {
  const { variant = "primary", size = "md", className = "" } = opts ?? {};
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`.trim();
}

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses({ variant, size, className })}
      {...rest}
    />
  );
}
