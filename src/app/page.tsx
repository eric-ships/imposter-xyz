"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function HomePage() {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState<null | "create" | "join">(null);
  const [error, setError] = useState<string | null>(null);

  function savePlayer(code: string, playerId: string, nickname: string) {
    localStorage.setItem(`ci:${code}:playerId`, playerId);
    localStorage.setItem(`ci:${code}:nickname`, nickname);
  }

  async function createRoom() {
    setError(null);
    setLoading("create");
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
      setLoading(null);
    }
  }

  async function joinRoom() {
    setError(null);
    setLoading("join");
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
      setLoading(null);
    }
  }

  const canCreate = nickname.trim().length > 0 && !loading;
  const canJoin =
    nickname.trim().length > 0 && joinCode.trim().length === 4 && !loading;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-14 px-8 py-16">
      <header className="text-center">
        <h1 className="font-serif text-5xl font-light italic tracking-tight text-ink">
          imposter
        </h1>
        <div className="mt-2 text-[10px] uppercase tracking-[0.4em] text-ink-faint">
          A parlor game · 3 to 5 players
        </div>
        <p className="mt-6 text-sm leading-relaxed text-ink-soft">
          Everyone sees the category.
          <br />
          At least one of you is lying.
        </p>
        <Link
          href="/rules"
          className="mt-5 inline-block border-b border-ink-faint pb-0.5 text-[10px] uppercase tracking-[0.3em] text-ink-soft transition hover:border-ink hover:text-ink"
        >
          How to play
        </Link>
      </header>

      <div className="w-full space-y-8">
        <label className="block">
          <span className="mb-3 block text-[10px] uppercase tracking-[0.3em] text-ink-faint">
            Your name
          </span>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={20}
            placeholder="Alice"
            className="w-full border-b border-line bg-transparent px-1 pb-2 text-xl text-ink outline-none transition placeholder:text-ink-faint focus:border-accent"
          />
        </label>

        <button
          onClick={createRoom}
          disabled={!canCreate}
          className="w-full rounded-sm bg-ink px-6 py-4 text-[11px] uppercase tracking-[0.3em] text-page transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-30"
        >
          {loading === "create" ? "Creating" : "Create a room"}
        </button>

        <div className="relative py-1 text-center text-[10px] uppercase tracking-[0.4em] text-ink-faint">
          <span className="bg-page px-4">or join</span>
          <div className="absolute inset-x-0 top-1/2 -z-10 h-px bg-line" />
        </div>

        <div className="flex gap-3">
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            maxLength={4}
            placeholder="CODE"
            className="flex-1 border-b border-line bg-transparent px-1 pb-2 text-center font-serif text-2xl tracking-[0.4em] text-ink outline-none transition placeholder:text-ink-faint focus:border-accent"
          />
          <button
            onClick={joinRoom}
            disabled={!canJoin}
            className="rounded-sm border border-ink px-6 py-3 text-[11px] uppercase tracking-[0.3em] text-ink transition hover:bg-ink hover:text-page disabled:cursor-not-allowed disabled:opacity-30"
          >
            {loading === "join" ? "..." : "Join"}
          </button>
        </div>

        {error && (
          <p className="border-l-2 border-oxblood bg-oxblood/5 px-4 py-2 text-sm text-oxblood">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
