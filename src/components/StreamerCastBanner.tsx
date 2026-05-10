"use client";

// Compact pill shown to every player in a room when the host has
// turned on streamer mode. Surfaces /spectate/[code] as a copy-able
// + open-in-new-tab URL so the table can be Chromecasted to a TV
// while phones hold the players' secrets.
//
// Hidden when streamerMode is off — we don't want every casual room
// to grow extra chrome. The host enables it from the lobby toggle.
import { useState } from "react";
import type { PublicRoomView } from "@/lib/game";

export function StreamerCastBanner({ view }: { view: PublicRoomView }) {
  const [copied, setCopied] = useState(false);
  if (!view.streamerMode) return null;

  const origin =
    typeof window !== "undefined" ? window.location.origin : "";
  const fullUrl = `${origin}/spectate/${view.code}`;
  // Strip protocol for compact display — copy still uses the full URL.
  const display = fullUrl.replace(/^https?:\/\//, "");

  async function copy() {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — silent */
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-sm border border-leaf/40 bg-leaf/5 px-3 py-2 text-[11px] uppercase tracking-[0.2em]">
      <span className="flex min-w-0 items-baseline gap-2">
        <span className="text-leaf">Cast</span>
        <span className="truncate text-ink normal-case tracking-normal">
          {display}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-3">
        <button
          type="button"
          onClick={copy}
          className="text-leaf transition hover:text-ink"
        >
          {copied ? "Copied" : "Copy"}
        </button>
        <a
          href={`/spectate/${view.code}`}
          target="_blank"
          rel="noreferrer"
          className="text-leaf transition hover:text-ink"
        >
          Open ↗
        </a>
      </span>
    </div>
  );
}
