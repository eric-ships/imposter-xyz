"use client";

import { useEffect, useState } from "react";
import {
  isMuted as audioIsMuted,
  playTurnChime,
  primeAudio,
  setMuted as audioSetMuted,
} from "@/lib/audio";

export default function SoundDebugPage() {
  const [muted, setMutedState] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMutedState(audioIsMuted());
    setMounted(true);
  }, []);

  function play() {
    primeAudio();
    playTurnChime();
  }

  function toggleMute() {
    primeAudio();
    const next = !muted;
    setMutedState(next);
    audioSetMuted(next);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-8 px-8 py-12">
      <header className="text-center">
        <div className="text-[10px] uppercase tracking-[0.4em] text-ink-faint">
          Debug
        </div>
        <h1 className="mt-2 font-serif text-3xl italic text-ink">
          Turn chime
        </h1>
        <p className="mt-3 text-sm text-ink-soft">
          The same two-tone chime that plays when it&apos;s your turn in a
          room.
        </p>
      </header>

      <button
        onClick={play}
        className="w-full rounded-sm bg-ink px-6 py-5 text-[11px] uppercase tracking-[0.3em] text-page transition hover:bg-accent"
      >
        Play chime
      </button>

      <div className="flex w-full items-center justify-between border-t border-line-soft pt-6 text-[10px] uppercase tracking-[0.3em] text-ink-faint">
        <span>Muted</span>
        <button
          onClick={toggleMute}
          className={`rounded-sm border px-4 py-2 transition ${
            mounted && muted
              ? "border-oxblood text-oxblood"
              : "border-line text-ink hover:border-accent hover:text-accent"
          }`}
        >
          {mounted ? (muted ? "On · tap to unmute" : "Off · tap to mute") : "…"}
        </button>
      </div>

      <p className="text-center text-[10px] uppercase tracking-[0.3em] text-ink-faint">
        Stored in localStorage as <span className="font-mono">imposter:muted</span>
      </p>
    </main>
  );
}
