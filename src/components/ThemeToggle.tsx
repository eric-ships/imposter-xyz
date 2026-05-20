"use client";

// Shared light/dark theme toggle. Two variants:
//
//   "pill"  text label "theme: light" / "theme: dark" styled with
//           .preference-pill (used on the landing, paired with the
//           sound toggle).
//   "icon"  sun/moon SVG button styled to blend into chrome (used
//           on /room and /group, where the toggle is one of several
//           small in-app controls and shouldn't draw attention).
//
// Both variants share the same useTheme call and the same mounted-
// flag pattern: the inline pre-paint script in <head> already set
// data-theme on <html> before React mounts, but the React tree's
// initial render doesn't know which value won, so we render the
// "light" placeholder for the first paint to match SSR and then
// reconcile to the actual value in useEffect. Without this the icon
// or label flickers on every cold load.

import { useEffect, useState } from "react";
import { useTheme } from "@/lib/theme";

type Variant = "pill" | "icon";

export function ThemeToggle({ variant = "icon" }: { variant?: Variant } = {}) {
  const { theme, toggle } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted ? theme === "dark" : false;
  const label = isDark ? "Switch to light theme" : "Switch to dark theme";

  if (variant === "pill") {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-pressed={isDark}
        aria-label={label}
        className="preference-pill rounded-full px-3 py-1.5 text-xs font-semibold lowercase"
      >
        theme: {isDark ? "dark" : "light"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={isDark}
      aria-label={label}
      title={label}
      className="flex h-9 w-9 items-center justify-center text-ink-faint transition-all duration-100 hover:text-ink active:scale-90"
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function SunIcon() {
  return (
    <svg
      aria-hidden
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      aria-hidden
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
    </svg>
  );
}
