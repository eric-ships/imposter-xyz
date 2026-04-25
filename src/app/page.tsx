"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Mode = "choose" | "create" | "join";

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
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-12 px-6 py-16">
      <header className="text-center">
        <h1 className="font-serif text-5xl font-light italic tracking-tight text-ink">
          imposter
        </h1>
        <div className="mt-3 text-xs tracking-wide text-ink-faint">
          A parlor game for 3–5 players
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
          <div className="space-y-4">
            <button
              onClick={() => setMode("create")}
              className="w-full rounded-sm bg-ink px-6 py-4 text-sm font-medium tracking-wide text-page transition hover:bg-accent"
            >
              Create or join
            </button>
            <p className="text-center text-xs text-ink-faint">
              You'll pick a name on the next step.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex gap-2 rounded-sm border border-line bg-surface/40 p-1 text-sm">
              <button
                onClick={() => setMode("create")}
                className={`flex-1 rounded-sm px-3 py-2 transition ${
                  mode === "create"
                    ? "bg-ink text-page"
                    : "text-ink-soft hover:text-ink"
                }`}
              >
                Create a room
              </button>
              <button
                onClick={() => setMode("join")}
                className={`flex-1 rounded-sm px-3 py-2 transition ${
                  mode === "join"
                    ? "bg-ink text-page"
                    : "text-ink-soft hover:text-ink"
                }`}
              >
                Join a room
              </button>
            </div>

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
              className="w-full rounded-sm bg-ink px-6 py-4 text-sm font-medium tracking-wide text-page transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-30"
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
