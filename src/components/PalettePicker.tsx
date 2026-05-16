"use client";

// Compact palette swatch + popover. Sits next to the dark-mode
// toggle in every page chrome (home, room, group). Click opens a
// menu of the 4 palettes; click a palette to apply instantly. The
// dark/light axis is orthogonal — the existing toggle still works,
// and switching palette preserves whichever mode the user is in.
import { useEffect, useRef, useState } from "react";
import {
  PALETTES,
  PALETTE_META,
  type Palette,
  useTheme,
} from "@/lib/theme";

export function PalettePicker() {
  const { palette, setPalette } = useTheme();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Avoid SSR/CSR icon mismatch: render a stable swatch until
  // localStorage has been read.
  useEffect(() => setMounted(true), []);

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
        aria-label="Choose theme palette"
        title={`Theme: ${meta.label}`}
        className="flex h-8 w-8 items-center justify-center transition-all duration-100 active:scale-90"
      >
        {/* Swatch: a small filled circle in the palette's primary color,
            ringed in the page color so it reads against any background. */}
        <span
          className="block h-4 w-4 rounded-full border border-line"
          style={{ backgroundColor: meta.swatch }}
        />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-2 w-56 rounded-sm border border-line bg-page p-1 shadow-lg"
          role="menu"
        >
          <div className="border-b border-line-soft px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-ink-faint">
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
        </div>
      )}
    </div>
  );
}
