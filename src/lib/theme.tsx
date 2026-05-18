"use client";

// Theme system: a single light | dark mode.
//
// (Earlier the app also had a four-palette axis — parchment / noir /
// marine / bloom — alongside this. That's retired; Upper has one
// cohesive theme now. See THEME.md.)
//
// The mode is exposed as `data-theme` on <html> so CSS picks light or
// dark purely with an attribute selector. "theme" is the historical
// name for the light/dark axis, kept so call-sites and the
// localStorage key stay stable.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export type Theme = "light" | "dark";

const THEME_KEY = "imposter:theme";

type Ctx = {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
};

const ThemeContext = createContext<Ctx | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // The pre-paint script in <head> already set data-theme on <html>
  // before React mounts. We mirror it into state on first client
  // render so React stays in sync with the DOM.
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    const t = readStoredTheme();
    setThemeState(t);
    applyTheme(t);
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

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle }}>
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

function applyTheme(t: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = t;
}

// Inline script that runs before React mounts to set data-theme on
// <html>, so there's no flash of the wrong mode on first paint.
// Stringified because Next requires the Script tag to receive a string.
export const themeBootScript = `
(function(){
  try {
    var tk = "${THEME_KEY}";
    var stored = localStorage.getItem(tk);
    var t = (stored === "dark" || stored === "light")
      ? stored
      : (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.dataset.theme = t;
  } catch (e) {}
})();
`;
