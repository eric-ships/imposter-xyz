"use client";

// One-tap share button for a finished match. Uses the Web Share API
// on mobile (native share sheet → Messages / Twitter / IG / TikTok /
// any installed app); falls back to copy-to-clipboard on desktop
// browsers that don't support Web Share. Both paths confirm via a
// transient inline label so the user knows it worked.
//
// The shared URL is /c/[code]. That page renders the card image
// inline + sets og:image so social previews show the card thumbnail.
import { useState } from "react";

type SharePayload = {
  code: string;
  // Game kind drives the share title text. Keeps the share sheet
  // preview specific instead of generic.
  kind: "imposter" | "wavelength" | "just-one";
};

function shareTitleFor(kind: SharePayload["kind"]): string {
  if (kind === "wavelength") return "We just played Wavelength on Upper";
  if (kind === "just-one") return "We just played Just One on Upper";
  return "We just played Imposter on Upper";
}

export function ShareMatchButton({ code, kind }: SharePayload) {
  const [state, setState] = useState<"idle" | "shared" | "copied">("idle");

  async function share() {
    const url = `${typeof window !== "undefined" ? window.location.origin : "https://upper.games"}/c/${code}`;
    const title = shareTitleFor(kind);
    const text = "Short, social games for the group — upper.games";

    // Prefer native share sheet on mobile. Web Share API is gated
    // on user gesture + secure context, both of which are true
    // here (button click on https deploy).
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function"
    ) {
      try {
        await navigator.share({ title, text, url });
        setState("shared");
        setTimeout(() => setState("idle"), 1800);
        return;
      } catch (e) {
        // User dismissed the sheet — silent, no fallback.
        if ((e as { name?: string }).name === "AbortError") return;
        // Other error → fall through to clipboard.
      }
    }
    // Desktop / no-Share-API fallback.
    try {
      await navigator.clipboard.writeText(url);
      setState("copied");
      setTimeout(() => setState("idle"), 1800);
    } catch {
      /* clipboard blocked — silent */
    }
  }

  const label =
    state === "shared"
      ? "Shared ✓"
      : state === "copied"
        ? "Link copied ✓"
        : "Share this match";

  return (
    <button
      type="button"
      onClick={share}
      className={`w-full rounded-sm border px-6 py-3 text-[11px] uppercase tracking-[0.2em] transition-all duration-100 active:scale-[0.97] ${
        state === "idle"
          ? "border-line text-ink-soft hover:border-ink hover:text-ink"
          : "border-leaf bg-leaf/10 text-leaf"
      }`}
    >
      {label}
    </button>
  );
}
