"use client";

// Compact palette swatch + popover. Sits next to the dark-mode
// toggle in every page chrome (home, room, group). Click opens a
// menu of the 4 palettes; click a palette to apply instantly. The
// dark/light axis is orthogonal — the existing toggle still works,
// and switching palette preserves whichever mode the user is in.
//
// Palettes are a signed-in perk: a player without an email account
// sees the picker locked, with a nudge to sign in. (Light/dark
// stays open to everyone — it's a comfort setting, not a perk.)
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PALETTES, PALETTE_META, useTheme } from "@/lib/theme";
import { useIdentity } from "@/lib/identity";

export function PalettePicker() {
  const { palette, setPalette } = useTheme();
  const identity = useIdentity();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Avoid SSR/CSR icon mismatch: render a stable swatch until
  // localStorage has been read.
  useEffect(() => setMounted(true), []);

  // Locked = identity has resolved AND there's no email account.
  // Gated on `ready` so a signed-in player never flashes a lock.
  const locked = identity.ready && !identity.email;

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = mounted ? palette : "parchment";
  const meta = PALETTE_META[current];

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={
          locked ? "Themes — sign in to unlock" : "Choose theme palette"
        }
        title={locked ? "Sign in to unlock themes" : `Theme: ${meta.label}`}
        className="relative flex h-8 w-8 items-center justify-center transition-all duration-100 active:scale-90"
      >
        {/* Swatch: a small filled circle in the palette's primary color,
            ringed in the page color so it reads against any background. */}
        <span
          className={`block h-4 w-4 rounded-full border border-line ${
            locked ? "opacity-50" : ""
          }`}
          style={{ backgroundColor: meta.swatch }}
        />
        {locked && (
          // Tiny lock badge over the swatch.
          <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-page text-ink-faint">
            <svg
              width="7"
              height="7"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3.5"
              strokeLinecap="round"
            >
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
          </span>
        )}
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-2 w-60 rounded-xl border-2 border-line bg-page p-1 shadow-lg"
          role="menu"
        >
          {locked ? (
            // Signed-out: the picker is a perk preview, not a control.
            <div className="space-y-2 p-3">
              <div className="text-xs font-bold uppercase tracking-[0.14em] text-ink-faint">
                Themes
              </div>
              <p className="text-sm text-ink-soft">
                Picking a theme is a signed-in perk. Sign in and the
                four palettes are yours.
              </p>
              <Link
                href="/auth"
                onClick={() => setOpen(false)}
                className="inline-block rounded-lg bg-accent px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white transition hover:brightness-110"
              >
                Sign in →
              </Link>
            </div>
          ) : (
            <>
              <div className="border-b border-line-soft px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-ink-faint">
                Theme
              </div>
              <ul className="py-1">
                {PALETTES.map((p) => {
                  const m = PALETTE_META[p];
                  const active = p === current;
                  return (
                    <li key={p}>
                      <button
                        type="button"
                        onClick={() => {
                          setPalette(p);
                          setOpen(false);
                        }}
                        role="menuitemradio"
                        aria-checked={active}
                        className={`flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-line-soft ${
                          active ? "bg-line-soft" : ""
                        }`}
                      >
                        <span
                          className="block h-4 w-4 shrink-0 rounded-full border border-line"
                          style={{ backgroundColor: m.swatch }}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-medium text-ink">
                            {m.label}
                          </span>
                          <span className="block text-[10px] text-ink-faint">
                            {m.description}
                          </span>
                        </span>
                        {active && (
                          <span className="shrink-0 text-[10px] uppercase tracking-[0.18em] text-accent">
                            ✓
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
