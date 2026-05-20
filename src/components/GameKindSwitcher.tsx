"use client";

// Lobby-only kind switcher. Host taps another game's card to flip
// the room's kind in place — players don't need to leave and rejoin.
// Non-host viewers see the same row but with read-only treatment on
// the inactive cards.
//
// Endpoint enforces the same rules independently (lobby + host only,
// pot-not-anted). This component just gates the UI.
//
// Visual matches the landing's "lineup ↓" cards: same two-anchor
// gradients (CARD_GRADIENT), same white vignette badge, same serif
// label. The selected card grows an accent ring; non-host viewers
// see inactive cards muted so the choice still reads as "the host's
// to make".

import { useState } from "react";
import type { GameKind } from "@/lib/game";
import { CARD_GRADIENT } from "@/lib/game-cards";
import { GAME_VIGNETTES } from "@/components/GameVignettes";

type KindOption = {
  kind: GameKind;
  label: string;
  sub: string;
};

const OPTIONS: KindOption[] = [
  { kind: "imposter", label: "Imposter", sub: "social deduction" },
  { kind: "wavelength", label: "Wavelength", sub: "spectrum guessing" },
  { kind: "just-one", label: "Just One", sub: "cooperative clues" },
  { kind: "crew", label: "Crew", sub: "co-op card game" },
  { kind: "hold", label: "Hold", sub: "co-op tower defense" },
];

export function GameKindSwitcher({
  code,
  playerId,
  isHost,
  currentKind,
}: {
  code: string;
  playerId: string;
  isHost: boolean;
  currentKind: GameKind;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(kind: GameKind) {
    if (!isHost || pending || kind === currentKind) return;
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/rooms/${code}/switch-kind`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, kind }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "switch failed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "switch failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="space-y-2">
      <h2 className="text-[11px] uppercase tracking-[0.22em] text-ink-faint">
        Game{!isHost && " · host picks"}
      </h2>
      <div className="grid grid-cols-1 gap-2.5">
        {OPTIONS.map((o) => {
          const selected = o.kind === currentKind;
          const interactive = isHost && !selected && !pending;
          const Vignette = GAME_VIGNETTES[o.kind];
          // Three visual states. The card is always rendered in its
          // brand gradient — the only difference is the ring on
          // selected, the hover lift on host-interactive, and a
          // slight desaturation on read-only inactive cards
          // (non-host or already-pending switch) so the choice still
          // reads as "the host's to make".
          return (
            <button
              key={o.kind}
              type="button"
              onClick={() => pick(o.kind)}
              disabled={!interactive}
              aria-pressed={selected}
              className={`group/gamecard relative flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left shadow-md transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-page ${
                selected
                  ? "scale-[1.01] ring-2 ring-accent ring-offset-2 ring-offset-page"
                  : interactive
                    ? "hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.99]"
                    : "opacity-65 saturate-75 cursor-default"
              }`}
              style={{ background: CARD_GRADIENT[o.kind] }}
            >
              {Vignette && (
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white">
                  <Vignette />
                </span>
              )}
              <span className="flex flex-col gap-0.5">
                <span className="font-serif text-xl text-white">
                  {o.label}
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/85">
                  {o.sub}
                </span>
              </span>
              {selected && (
                <span className="ml-auto rounded-full bg-white/95 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink">
                  Picked
                </span>
              )}
            </button>
          );
        })}
      </div>
      {error && (
        <p className="border-l border-oxblood bg-oxblood/5 px-3 py-1.5 text-xs text-oxblood">
          {error}
        </p>
      )}
    </section>
  );
}
