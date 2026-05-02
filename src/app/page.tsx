"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTheme } from "@/lib/theme";

type Mode = "choose" | "create" | "join";

function HomeThemeToggle() {
  const { theme, toggle } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted ? theme === "dark" : false;
  return (
    <button
      onClick={toggle}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className="flex h-8 w-8 items-center justify-center text-ink-faint transition-all duration-100 hover:text-ink active:scale-90"
    >
      {isDark ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
        </svg>
      )}
    </button>
  );
}

export default function HomePage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("choose");
  const [nickname, setNickname] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function savePlayer(code: string, playerId: string, nickname: string) {
    localStorage.setItem(`ci:${code}:playerId`, playerId);
    localStorage.setItem(`ci:${code}:nickname`, nickname);
  }

  async function createRoom() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: nickname.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
      savePlayer(data.code, data.playerId, nickname.trim());
      router.push(`/room/${data.code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
      setSubmitting(false);
    }
  }

  async function joinRoom() {
    setError(null);
    setSubmitting(true);
    try {
      const code = joinCode.trim().toUpperCase();
      const res = await fetch(`/api/rooms/${code}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: nickname.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
      savePlayer(code, data.playerId, nickname.trim());
      router.push(`/room/${code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
      setSubmitting(false);
    }
  }

  const canSubmit =
    nickname.trim().length > 0 &&
    !submitting &&
    (mode === "create" ||
      (mode === "join" && joinCode.trim().length === 4));

  return (
    <main className="relative mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-12 px-6 py-16">
      <div className="absolute right-4 top-4">
        <HomeThemeToggle />
      </div>
      <header className="text-center">
        <h1 className="font-serif text-5xl font-light italic tracking-tight text-ink">
          imposter
        </h1>
        <div className="mt-3 text-xs tracking-wide text-ink-faint">
          A parlor game for 3–8 players
        </div>
        <p className="mt-6 text-base leading-relaxed text-ink-soft">
          Everyone sees the category.
          <br />
          At least one of you is lying.
        </p>
        <Link
          href="/rules"
          className="mt-5 inline-block border-b border-ink-faint pb-0.5 text-xs text-ink-soft transition hover:border-ink hover:text-ink"
        >
          How to play
        </Link>
      </header>

      <div className="w-full">
        {mode === "choose" ? (
          <div className="space-y-3">
            <button
              onClick={() => setMode("create")}
              className="w-full rounded-sm bg-ink px-6 py-4 text-sm font-medium tracking-wide text-page transition-all duration-100 hover:bg-accent active:scale-[0.97]"
            >
              Create a room
            </button>
            <button
              onClick={() => setMode("join")}
              className="w-full rounded-sm border border-ink px-6 py-4 text-sm font-medium tracking-wide text-ink transition-all duration-100 hover:bg-ink hover:text-page active:scale-[0.97]"
            >
              Join a room
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <label className="block">
              <span className="mb-2 block text-sm text-ink-soft">
                Your name
              </span>
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                maxLength={20}
                placeholder="Alice"
                autoFocus
                className="w-full border-b border-line bg-transparent px-1 pb-2 text-xl text-ink outline-none transition placeholder:text-ink-faint focus:border-accent"
              />
            </label>

            {mode === "join" && (
              <label className="block">
                <span className="mb-2 block text-sm text-ink-soft">
                  Room code
                </span>
                <input
                  value={joinCode}
                  onChange={(e) =>
                    setJoinCode(e.target.value.toUpperCase().slice(0, 4))
                  }
                  maxLength={4}
                  placeholder="ABCD"
                  className="w-full border-b border-line bg-transparent px-1 pb-2 text-center font-serif text-2xl tracking-[0.3em] text-ink outline-none transition placeholder:text-ink-faint focus:border-accent"
                />
              </label>
            )}

            <button
              onClick={mode === "create" ? createRoom : joinRoom}
              disabled={!canSubmit}
              className="w-full rounded-sm bg-ink px-6 py-4 text-sm font-medium tracking-wide text-page transition-all duration-100 hover:bg-accent active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-30"
            >
              {submitting
                ? mode === "create"
                  ? "Creating…"
                  : "Joining…"
                : mode === "create"
                  ? "Create room"
                  : "Join room"}
            </button>

            <button
              onClick={() => {
                setMode("choose");
                setError(null);
              }}
              className="block w-full text-center text-xs text-ink-faint transition hover:text-ink"
            >
              ← Back
            </button>

            {error && (
              <p className="border-l-2 border-oxblood bg-oxblood/5 px-4 py-2 text-sm text-oxblood">
                {error}
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
