"use client";

// Theme system has two independent dimensions:
//
//   1. mode    — light | dark (the existing "is it dark out" toggle)
//   2. palette — parchment | noir | marine | bloom (the color family)
//
// They cross: each palette ships both a light and a dark variant in
// globals.css. The DOM exposes both as data attributes on <html>
// (data-theme + data-palette) so CSS picks the right combination
// purely with attribute selectors — no JS class juggling.
//
// "theme" stays as the historical name for the light/dark axis so
// existing call-sites and the localStorage key keep working.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export type Theme = "light" | "dark";

export type Palette = "parchment" | "noir" | "marine" | "bloom";

export const PALETTES: Palette[] = ["parchment", "noir", "marine", "bloom"];

export const DEFAULT_PALETTE: Palette = "parchment";

// Display metadata for each palette. Keep in sync with globals.css —
// the swatch hex must match the palette's primary accent so the
// picker preview reads correctly. Light/dark accent are slightly
// different but the picker uses the light value as the canonical
// preview so it reads in either mode.
export const PALETTE_META: Record<
  Palette,
  { label: string; description: string; swatch: string }
> = {
  parchment: {
    label: "Parchment",
    description: "Warm paper with a vermilion punch.",
    swatch: "#d6471f",
  },
  noir: {
    label: "Noir",
    description: "Stark monochrome lit by electric cobalt.",
    swatch: "#2f5cff",
  },
  marine: {
    label: "Marine",
    description: "Deep teal cut with hot coral.",
    swatch: "#ff6b4a",
  },
  bloom: {
    label: "Bloom",
    description: "Bright and poppy — vivid magenta.",
    swatch: "#e0207a",
  },
};

const THEME_KEY = "imposter:theme";
const PALETTE_KEY = "imposter:palette";

type Ctx = {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
  palette: Palette;
  setPalette: (p: Palette) => void;
};

const ThemeContext = createContext<Ctx | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Pre-paint script in <head> already set both data attributes on
  // <html> before React mounts. We mirror them here so React state
  // stays in sync with the DOM. SSR defaults are corrected on first
  // client render via the effect below.
  const [theme, setThemeState] = useState<Theme>("light");
  const [palette, setPaletteState] = useState<Palette>(DEFAULT_PALETTE);

  useEffect(() => {
    const t = readStoredTheme();
    const p = readStoredPalette();
    setThemeState(t);
    setPaletteState(p);
    applyTheme(t);
    applyPalette(p);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    applyTheme(t);
    try {
      window.localStorage.setItem(THEME_KEY, t);
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  const setPalette = useCallback((p: Palette) => {
    setPaletteState(p);
    applyPalette(p);
    try {
      window.localStorage.setItem(PALETTE_KEY, p);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <ThemeContext.Provider
      value={{ theme, setTheme, toggle, palette, setPalette }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): Ctx {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used inside ThemeProvider");
  }
  return ctx;
}

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "light";
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    /* ignore */
  }
  if (
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }
  return "light";
}

function readStoredPalette(): Palette {
  if (typeof window === "undefined") return DEFAULT_PALETTE;
  try {
    const stored = window.localStorage.getItem(PALETTE_KEY);
    if (stored && (PALETTES as string[]).includes(stored)) {
      return stored as Palette;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_PALETTE;
}

function applyTheme(t: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = t;
}

function applyPalette(p: Palette) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.palette = p;
}

// Inline script that runs before React mounts to set both
// data-theme + data-palette on <html>, so there's no flash of the
// wrong palette on first paint. Stringified because Next requires
// the Script tag to receive a string.
export const themeBootScript = `
(function(){
  try {
    var tk = "${THEME_KEY}";
    var pk = "${PALETTE_KEY}";
    var stored = localStorage.getItem(tk);
    var t = (stored === "dark" || stored === "light")
      ? stored
      : (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    var palettes = ["parchment","noir","marine","bloom"];
    var p = localStorage.getItem(pk);
    if (palettes.indexOf(p) === -1) p = "parchment";
    document.documentElement.dataset.theme = t;
    document.documentElement.dataset.palette = p;
  } catch (e) {}
})();
`;
