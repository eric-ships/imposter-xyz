"use client";

// Host toggle for streamer mode. Renders the same panel shape as
// MoleModeToggle / JesusModeToggle / PoliceModeToggle so the lobby
// settings stack reads as a single coherent column. Non-hosts see a
// read-only status pill (so the table knows what mode is on).
//
// Unlike the other host modes, streamer mode is NOT lobby-only — it
// can be flipped any time. The host might decide to start streaming
// halfway through a session. We still surface the toggle in the
// lobby for discoverability; hosts who want to enable mid-game can
// re-open the lobby... actually they can't, so we render the toggle
// in the room header chrome too via StreamerCastBanner's host hint.
// For now, mid-game enable is a known corner the host handles by
// keeping the toggle on for the whole session.
import { useState } from "react";
import type { PublicRoomView } from "@/lib/game";

export function StreamerModeToggle({
  view,
  playerId,
  code,
}: {
  view: PublicRoomView;
  playerId: string;
  code: string;
}) {
  const isHost = playerId === view.hostId;
  const enabled = view.streamerMode;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/rooms/${code}/streamer-mode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, enabled: !enabled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      className={`space-y-2 border p-4 ${
        enabled ? "border-leaf/40 bg-leaf/5" : "border-line"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-ink-faint">
            Streamer mode
          </div>
          <p className="mt-1 text-[11px] text-ink-soft">
            Show every player a &ldquo;cast → /spectate/{view.code}&rdquo; pill.
            Cast that URL to a TV; players keep secrets on their phones.
          </p>
          <p className="mt-1 text-[11px] text-ink-faint">
            Works for OBS browser sources, Chromecast, AirPlay, or any
            screen mirror.
          </p>
        </div>
        {isHost ? (
          <button
            onClick={toggle}
            disabled={pending}
            className={`shrink-0 rounded-sm px-4 py-2 text-[11px] uppercase tracking-[0.2em] transition-all duration-100 active:scale-[0.96] disabled:opacity-40 disabled:active:scale-100 ${
              enabled
                ? "bg-leaf text-page hover:bg-ink"
                : "border border-ink text-ink hover:bg-ink hover:text-page"
            }`}
          >
            {pending ? "..." : enabled ? "On" : "Off"}
          </button>
        ) : (
          <span
            className={`shrink-0 rounded-sm border px-3 py-1 text-[11px] uppercase tracking-[0.2em] ${
              enabled
                ? "border-leaf/60 text-leaf"
                : "border-line text-ink-faint"
            }`}
            title="Only the host can change this"
          >
            {enabled ? "On" : "Off"}
          </span>
        )}
      </div>
      {error && (
        <p className="text-[11px] text-oxblood">{error}</p>
      )}
    </section>
  );
}
