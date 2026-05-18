"use client";

// Lobby-only kind switcher. Host taps the other game's pill to flip
// the room's kind in place — players don't need to leave and rejoin.
// Non-host viewers see the same row but the inactive pill is read-only.
//
// Endpoint enforces the same rules independently (lobby + host only,
// pot-not-anted). This component just gates the UI.
import { useState } from "react";
import type { GameKind } from "@/lib/game";

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
      <div className="grid grid-cols-1 gap-2">
        {OPTIONS.map((o) => {
          const selected = o.kind === currentKind;
          const interactive = isHost && !selected && !pending;
          return (
            <button
              key={o.kind}
              type="button"
              onClick={() => pick(o.kind)}
              disabled={!interactive}
              aria-pressed={selected}
              className={`flex flex-col items-start gap-1 rounded-sm border px-3 py-2.5 text-left transition-all duration-100 ${
                selected
                  ? "border-accent bg-accent/10"
                  : interactive
                    ? "border-line text-ink-soft hover:border-ink hover:text-ink active:scale-[0.98]"
                    : "border-line text-ink-faint cursor-default"
              }`}
            >
              <span
                className={`font-serif text-base ${
                  selected ? "text-ink" : ""
                }`}
              >
                {o.label}
              </span>
              <span className="text-[10px] uppercase tracking-[0.18em] text-ink-faint">
                {o.sub}
              </span>
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
