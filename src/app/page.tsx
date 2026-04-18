"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-10 px-6 py-12">
      <header className="text-center">
        <h1 className="text-4xl font-black tracking-tight">imposter.xyz</h1>
        <p className="mt-2 text-sm text-neutral-400">
          Everyone sees the category. One person is the imposter.
        </p>
      </header>

      <div className="w-full space-y-6">
        <label className="block">
          <span className="mb-2 block text-xs uppercase tracking-wider text-neutral-400">
            Your nickname
          </span>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={20}
            placeholder="e.g. Alice"
            className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3 text-lg outline-none focus:border-neutral-500"
          />
        </label>

        <button
          onClick={createRoom}
          disabled={!canCreate}
          className="w-full rounded-lg bg-indigo-500 px-4 py-3 text-lg font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading === "create" ? "Creating..." : "Create room"}
        </button>

        <div className="relative text-center text-xs text-neutral-500">
          <span className="bg-neutral-950 px-3">or join</span>
          <div className="absolute inset-x-0 top-1/2 -z-10 h-px bg-neutral-800" />
        </div>

        <div className="flex gap-2">
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            maxLength={4}
            placeholder="CODE"
            className="flex-1 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3 text-center text-xl font-mono tracking-widest outline-none focus:border-neutral-500"
          />
          <button
            onClick={joinRoom}
            disabled={!canJoin}
            className="rounded-lg bg-neutral-800 px-5 py-3 font-semibold transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading === "join" ? "..." : "Join"}
          </button>
        </div>

        {error && (
          <p className="rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
