"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/browser";
import type { PublicRoomView } from "@/lib/game";

export default function RoomPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: rawCode } = use(params);
  const code = rawCode.toUpperCase();
  const router = useRouter();

  const [playerId, setPlayerId] = useState<string | null>(null);
  const [joinNickname, setJoinNickname] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const [view, setView] = useState<PublicRoomView | null>(null);
  const [notFound, setNotFound] = useState(false);

  // Mount: look for stored playerId.
  useEffect(() => {
    const stored = localStorage.getItem(`ci:${code}:playerId`);
    if (stored) setPlayerId(stored);
  }, [code]);

  const refetch = useCallback(async () => {
    const url = playerId
      ? `/api/rooms/${code}?playerId=${playerId}`
      : `/api/rooms/${code}`;
    const res = await fetch(url);
    if (res.status === 404) {
      setNotFound(true);
      return;
    }
    const data = (await res.json()) as PublicRoomView;
    setView(data);
  }, [code, playerId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  // Subscribe to room events via Supabase Realtime.
  useEffect(() => {
    const channel = supabase
      .channel(`room_events:${code}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "room_events",
          filter: `room_code=eq.${code}`,
        },
        () => {
          refetch();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [code, refetch]);

  async function doJoin() {
    setJoinError(null);
    setJoining(true);
    try {
      const res = await fetch(`/api/rooms/${code}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: joinNickname.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
      localStorage.setItem(`ci:${code}:playerId`, data.playerId);
      localStorage.setItem(`ci:${code}:nickname`, joinNickname.trim());
      setPlayerId(data.playerId);
    } catch (e) {
      setJoinError(e instanceof Error ? e.message : "failed");
    } finally {
      setJoining(false);
    }
  }

  if (notFound) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6">
        <h1 className="text-2xl font-bold">Room not found</h1>
        <p className="text-sm text-neutral-400">Code {code} doesn&apos;t exist.</p>
        <button
          onClick={() => router.push("/")}
          className="rounded-lg bg-neutral-800 px-4 py-2 text-sm"
        >
          Back home
        </button>
      </main>
    );
  }

  if (!view) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md items-center justify-center">
        <p className="text-sm text-neutral-500">Loading...</p>
      </main>
    );
  }

  // If not a player in this room yet, show join form (room exists).
  if (!view.you) {
    if (view.state !== "lobby") {
      return (
        <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6">
          <h1 className="text-2xl font-bold">Game in progress</h1>
          <p className="text-sm text-neutral-400">
            This room has already started. Wait for the next round.
          </p>
          <button
            onClick={() => router.push("/")}
            className="rounded-lg bg-neutral-800 px-4 py-2 text-sm"
          >
            Back home
          </button>
        </main>
      );
    }
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-6">
        <h1 className="text-2xl font-bold">
          Join room{" "}
          <span className="font-mono tracking-widest text-indigo-300">
            {code}
          </span>
        </h1>
        <input
          value={joinNickname}
          onChange={(e) => setJoinNickname(e.target.value)}
          maxLength={20}
          placeholder="Your nickname"
          className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3 text-lg outline-none focus:border-neutral-500"
        />
        <button
          onClick={doJoin}
          disabled={joining || joinNickname.trim().length === 0}
          className="w-full rounded-lg bg-indigo-500 px-4 py-3 font-semibold disabled:opacity-40"
        >
          {joining ? "Joining..." : "Join"}
        </button>
        {joinError && (
          <p className="text-sm text-red-400">{joinError}</p>
        )}
      </main>
    );
  }

  return <RoomPlay view={view} playerId={view.you.id} code={code} onRefetch={refetch} />;
}

function RoomPlay({
  view,
  playerId,
  code,
  onRefetch,
}: {
  view: PublicRoomView;
  playerId: string;
  code: string;
  onRefetch: () => void;
}) {
  const you = view.you!;
  const nicknameById = new Map(view.players.map((p) => [p.id, p.nickname]));

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 px-6 py-8">
      <header className="flex items-baseline justify-between border-b border-neutral-800 pb-3">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-neutral-500">
            Room
          </div>
          <div className="font-mono text-2xl font-bold tracking-widest text-indigo-300">
            {code}
          </div>
        </div>
        <div className="text-right text-xs text-neutral-400">
          You: <span className="text-neutral-100">{nicknameById.get(playerId)}</span>
          {you.isHost && <span className="ml-2 text-indigo-400">(host)</span>}
        </div>
      </header>

      {view.state === "lobby" && (
        <LobbyPhase view={view} playerId={playerId} code={code} onRefetch={onRefetch} />
      )}

      {view.state === "playing" && (
        <PlayingPhase view={view} playerId={playerId} code={code} />
      )}

      {view.state === "voting" && (
        <VotingPhase view={view} playerId={playerId} code={code} />
      )}

      {view.state === "reveal" && (
        <RevealPhase view={view} playerId={playerId} code={code} />
      )}
    </main>
  );
}

function PlayerList({
  view,
  highlightId,
}: {
  view: PublicRoomView;
  highlightId?: string | null;
}) {
  return (
    <ul className="space-y-1">
      {view.players.map((p) => (
        <li
          key={p.id}
          className={`flex items-center justify-between rounded-md px-3 py-2 text-sm ${
            highlightId === p.id
              ? "bg-indigo-500/20 ring-1 ring-indigo-400/50"
              : "bg-neutral-900"
          }`}
        >
          <span>
            {p.nickname}
            {p.id === view.hostId && (
              <span className="ml-2 text-[10px] uppercase text-neutral-500">
                host
              </span>
            )}
          </span>
          <span className="text-xs text-neutral-500">{p.score} pts</span>
        </li>
      ))}
    </ul>
  );
}

function LobbyPhase({
  view,
  playerId,
  code,
  onRefetch,
}: {
  view: PublicRoomView;
  playerId: string;
  code: string;
  onRefetch: () => void;
}) {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isHost = playerId === view.hostId;
  const canStart = view.players.length >= 3;

  async function start() {
    setError(null);
    setStarting(true);
    try {
      const res = await fetch(`/api/rooms/${code}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
      onRefetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    } finally {
      setStarting(false);
    }
  }

  const shareUrl =
    typeof window !== "undefined" ? `${window.location.origin}/room/${code}` : "";

  return (
    <>
      <section className="space-y-3">
        <h2 className="text-xs uppercase tracking-widest text-neutral-400">
          Players ({view.players.length})
        </h2>
        <PlayerList view={view} />
      </section>

      <section className="space-y-2">
        <div className="text-xs uppercase tracking-widest text-neutral-400">
          Invite
        </div>
        <div className="flex gap-2">
          <input
            readOnly
            value={shareUrl}
            className="flex-1 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs text-neutral-400"
          />
          <button
            onClick={() => navigator.clipboard.writeText(shareUrl)}
            className="rounded-md bg-neutral-800 px-3 py-2 text-xs hover:bg-neutral-700"
          >
            Copy
          </button>
        </div>
      </section>

      {isHost ? (
        <button
          onClick={start}
          disabled={!canStart || starting}
          className="rounded-lg bg-indigo-500 px-4 py-3 font-semibold disabled:opacity-40"
        >
          {starting
            ? "Starting..."
            : canStart
              ? "Start game"
              : `Need ${3 - view.players.length} more player${3 - view.players.length === 1 ? "" : "s"}`}
        </button>
      ) : (
        <p className="text-center text-sm text-neutral-500">
          Waiting for host to start...
        </p>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
    </>
  );
}

function PlayingPhase({
  view,
  playerId,
  code,
}: {
  view: PublicRoomView;
  playerId: string;
  code: string;
}) {
  const [word, setWord] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nicknameById = new Map(view.players.map((p) => [p.id, p.nickname]));
  const currentPlayerId = view.turnOrder[view.turnIndex];
  const isMyTurn = currentPlayerId === playerId;
  const you = view.you!;

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/rooms/${code}/clue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, word: word.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
      setWord("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
        <div className="text-[10px] uppercase tracking-widest text-neutral-500">
          Category (everyone sees this)
        </div>
        <div className="mt-1 text-xl font-bold text-neutral-100">
          {view.category}
        </div>
        <div className="mt-4 border-t border-neutral-800 pt-4">
          {you.isImposter ? (
            <>
              <div className="text-[10px] uppercase tracking-widest text-rose-400">
                You are the imposter
              </div>
              <div className="mt-1 text-sm text-neutral-300">
                Bluff. Guess the secret word from others&apos; clues.
              </div>
            </>
          ) : (
            <>
              <div className="text-[10px] uppercase tracking-widest text-emerald-400">
                Secret word
              </div>
              <div className="mt-1 text-2xl font-bold text-emerald-300">
                {you.secretWord}
              </div>
            </>
          )}
        </div>
      </section>

      <section className="rounded-lg bg-neutral-900 px-4 py-3 text-center text-xs uppercase tracking-widest text-neutral-400">
        Round {view.round} of {view.totalRounds}
      </section>

      <TurnStrip view={view} playerId={playerId} />

      {isMyTurn ? (
        <div className="space-y-2">
          <label className="block text-xs uppercase tracking-widest text-neutral-400">
            Your one-word clue
          </label>
          <div className="flex gap-2">
            <input
              value={word}
              onChange={(e) => setWord(e.target.value)}
              maxLength={40}
              placeholder="e.g. slippery"
              className="flex-1 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3 outline-none focus:border-neutral-500"
              onKeyDown={(e) => {
                if (e.key === "Enter" && word.trim() && !submitting) submit();
              }}
            />
            <button
              onClick={submit}
              disabled={submitting || word.trim().length === 0}
              className="rounded-lg bg-indigo-500 px-5 font-semibold disabled:opacity-40"
            >
              {submitting ? "..." : "Submit"}
            </button>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
      ) : (
        <p className="text-center text-sm text-neutral-500">
          Waiting for {nicknameById.get(currentPlayerId)}...
        </p>
      )}

      <ClueLog view={view} />
    </>
  );
}

const AVATAR_PALETTE = [
  "bg-rose-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-sky-500",
  "bg-violet-500",
  "bg-fuchsia-500",
  "bg-teal-500",
  "bg-orange-500",
  "bg-lime-500",
  "bg-cyan-500",
];

function avatarFor(id: string, nickname: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  const color = AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
  const initial = nickname.trim().charAt(0).toUpperCase() || "?";
  return { color, initial };
}

function TurnStrip({
  view,
  playerId,
}: {
  view: PublicRoomView;
  playerId: string;
}) {
  const currentPlayerId = view.turnOrder[view.turnIndex];
  const cluedThisRound = new Set(
    view.clues.filter((c) => c.round === view.round).map((c) => c.player_id)
  );
  const playerById = new Map(view.players.map((p) => [p.id, p]));
  const orderedIds = [
    ...view.turnOrder,
    ...view.players
      .map((p) => p.id)
      .filter((id) => !view.turnOrder.includes(id)),
  ];

  return (
    <section className="flex gap-3 overflow-x-auto pb-1">
      {orderedIds.map((id) => {
        const p = playerById.get(id);
        if (!p) return null;
        const isCurrent = id === currentPlayerId;
        const isDone = cluedThisRound.has(id);
        const isYou = id === playerId;
        const { color, initial } = avatarFor(id, p.nickname);

        return (
          <div
            key={id}
            className="flex min-w-[64px] flex-col items-center gap-1"
          >
            <div className="relative">
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold text-white transition ${color} ${
                  isCurrent
                    ? "ring-4 ring-indigo-400 ring-offset-2 ring-offset-neutral-950"
                    : isDone
                      ? "opacity-40"
                      : ""
                }`}
              >
                {initial}
              </div>
              {isDone && (
                <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white">
                  ✓
                </span>
              )}
            </div>
            <span
              className={`max-w-[72px] truncate text-xs ${
                isCurrent
                  ? "font-semibold text-indigo-300"
                  : "text-neutral-400"
              }`}
              title={p.nickname}
            >
              {isYou ? `${p.nickname} (you)` : p.nickname}
            </span>
          </div>
        );
      })}
    </section>
  );
}

function ClueLog({ view }: { view: PublicRoomView }) {
  const nicknameById = new Map(view.players.map((p) => [p.id, p.nickname]));
  const rounds: Record<number, typeof view.clues> = {};
  for (const c of view.clues) {
    (rounds[c.round] ??= []).push(c);
  }

  if (view.clues.length === 0) return null;

  return (
    <section className="space-y-3">
      <h3 className="text-xs uppercase tracking-widest text-neutral-400">
        Clues
      </h3>
      <div className="space-y-3">
        {Object.entries(rounds)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([round, clues]) => (
            <div key={round} className="rounded-lg bg-neutral-900 p-3">
              <div className="mb-2 text-[10px] uppercase tracking-widest text-neutral-500">
                Round {round}
              </div>
              <ul className="space-y-1 text-sm">
                {clues.map((c) => (
                  <li
                    key={c.id}
                    className="flex justify-between border-b border-neutral-800 pb-1 last:border-0 last:pb-0"
                  >
                    <span className="text-neutral-400">
                      {nicknameById.get(c.player_id)}
                    </span>
                    <span className="font-medium text-neutral-100">
                      {c.word}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
      </div>
    </section>
  );
}

function VotingPhase({
  view,
  playerId,
  code,
}: {
  view: PublicRoomView;
  playerId: string;
  code: string;
}) {
  const [target, setTarget] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const myVote = view.votes.find((v) => v.voter_id === playerId);
  const alreadyVoted = !!myVote;

  async function submit() {
    if (!target) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/rooms/${code}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, targetId: target }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    } finally {
      setSubmitting(false);
    }
  }

  const votesReceived = view.votes.length;
  const totalPlayers = view.players.length;

  return (
    <>
      <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
        <div className="text-[10px] uppercase tracking-widest text-neutral-500">
          Category was
        </div>
        <div className="mt-1 text-xl font-bold">{view.category}</div>
      </section>

      <ClueLog view={view} />

      <section className="space-y-3">
        <h3 className="text-xs uppercase tracking-widest text-neutral-400">
          Who is the imposter?
        </h3>
        <div className="grid gap-2">
          {view.players.map((p) => {
            const isYou = p.id === playerId;
            const selected = target === p.id;
            return (
              <button
                key={p.id}
                onClick={() => !alreadyVoted && !isYou && setTarget(p.id)}
                disabled={alreadyVoted || isYou}
                className={`flex items-center justify-between rounded-lg border px-4 py-3 text-left transition ${
                  selected
                    ? "border-indigo-400 bg-indigo-500/20"
                    : "border-neutral-800 bg-neutral-900"
                } ${isYou || alreadyVoted ? "opacity-40" : "hover:border-neutral-600"}`}
              >
                <span>
                  {p.nickname}
                  {isYou && (
                    <span className="ml-2 text-xs text-neutral-500">(you)</span>
                  )}
                </span>
                {alreadyVoted && myVote.target_id === p.id && (
                  <span className="text-xs text-indigo-300">your vote</span>
                )}
              </button>
            );
          })}
        </div>
        {!alreadyVoted ? (
          <button
            onClick={submit}
            disabled={!target || submitting}
            className="w-full rounded-lg bg-indigo-500 px-4 py-3 font-semibold disabled:opacity-40"
          >
            {submitting ? "Submitting..." : "Lock in vote"}
          </button>
        ) : (
          <p className="text-center text-sm text-neutral-500">
            Vote locked. Waiting for others... ({votesReceived}/{totalPlayers})
          </p>
        )}
        {error && <p className="text-sm text-red-400">{error}</p>}
      </section>
    </>
  );
}

function RevealPhase({
  view,
  playerId,
  code,
}: {
  view: PublicRoomView;
  playerId: string;
  code: string;
}) {
  const nicknameById = new Map(view.players.map((p) => [p.id, p.nickname]));
  const reveal = view.reveal!;
  const isHost = playerId === view.hostId;
  const [restarting, setRestarting] = useState(false);
  const router = useRouter();

  // Vote tally
  const counts = new Map<string, number>();
  for (const v of view.votes) {
    counts.set(v.target_id, (counts.get(v.target_id) ?? 0) + 1);
  }
  const topCount = Math.max(...Array.from(counts.values()), 0);
  const topTargets = Array.from(counts.entries())
    .filter(([, n]) => n === topCount)
    .map(([id]) => id);
  const tied = topTargets.length > 1;
  const caught = !tied && topTargets[0] === reveal.imposterId;

  async function playAgain() {
    setRestarting(true);
    const res = await fetch(`/api/rooms/${code}/play-again`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId }),
    });
    if (!res.ok) setRestarting(false);
  }

  const sortedPlayers = [...view.players].sort((a, b) => b.score - a.score);
  const youAreImposter = playerId === reveal.imposterId;
  const youWon = youAreImposter ? !caught : caught;
  const pointsEarned = youAreImposter ? (caught ? 0 : 2) : caught ? 1 : 0;
  const outcomeLabel = caught
    ? "Crewmates win"
    : tied
      ? "Tie vote - imposter wins"
      : "Imposter wins";
  const subtitle = youAreImposter
    ? caught
      ? "They sniffed you out."
      : "You fooled them all."
    : caught
      ? "You caught the imposter."
      : tied
        ? "The vote was tied - imposter escapes."
        : "The imposter slipped past you.";

  return (
    <>
      <section
        className={`rounded-2xl border-2 p-6 text-center ${
          youWon
            ? "border-emerald-400/50 bg-emerald-500/10"
            : "border-rose-400/50 bg-rose-500/10"
        }`}
      >
        <div
          className={`text-5xl font-black tracking-tight ${
            youWon ? "text-emerald-300" : "text-rose-300"
          }`}
        >
          {youWon ? "You won!" : "You lost"}
        </div>
        <div className="mt-2 text-sm text-neutral-300">{subtitle}</div>
        {pointsEarned > 0 && (
          <div className="mt-3 inline-block rounded-full bg-neutral-900 px-3 py-1 text-xs font-semibold text-neutral-200">
            +{pointsEarned} pt{pointsEarned === 1 ? "" : "s"}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5 text-center">
        <div className="text-[10px] uppercase tracking-widest text-neutral-500">
          The imposter was
        </div>
        <div className="mt-2 text-3xl font-black text-rose-300">
          {nicknameById.get(reveal.imposterId)}
        </div>
        <div className="mt-4 border-t border-neutral-800 pt-4">
          <div className="text-[10px] uppercase tracking-widest text-neutral-500">
            Secret word
          </div>
          <div className="mt-1 text-2xl font-bold text-emerald-300">
            {reveal.secretWord}
          </div>
          <div className="text-xs text-neutral-500">
            Category: {view.category}
          </div>
        </div>
        <div
          className={`mt-5 inline-block rounded-full px-4 py-1 text-xs font-bold ${
            caught
              ? "bg-emerald-500/20 text-emerald-300"
              : "bg-rose-500/20 text-rose-300"
          }`}
        >
          {outcomeLabel}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs uppercase tracking-widest text-neutral-400">
          Votes
        </h3>
        <ul className="space-y-1 text-sm">
          {view.votes.map((v, i) => (
            <li
              key={i}
              className="flex justify-between rounded-md bg-neutral-900 px-3 py-2"
            >
              <span className="text-neutral-400">
                {nicknameById.get(v.voter_id)}
              </span>
              <span>→ {nicknameById.get(v.target_id)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs uppercase tracking-widest text-neutral-400">
          Scoreboard
        </h3>
        <PlayerList view={{ ...view, players: sortedPlayers }} />
      </section>

      {isHost ? (
        <div className="flex gap-2">
          <button
            onClick={playAgain}
            disabled={restarting}
            className="flex-1 rounded-lg bg-indigo-500 px-4 py-3 font-semibold disabled:opacity-40"
          >
            {restarting ? "..." : "Play again"}
          </button>
          <button
            onClick={() => router.push("/")}
            className="rounded-lg bg-neutral-800 px-4 py-3 font-semibold"
          >
            Exit
          </button>
        </div>
      ) : (
        <p className="text-center text-sm text-neutral-500">
          Waiting for host to start the next round...
        </p>
      )}
    </>
  );
}
