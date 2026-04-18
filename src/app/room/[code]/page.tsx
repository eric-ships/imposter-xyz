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
  const [hydrated, setHydrated] = useState(false);
  const [joinNickname, setJoinNickname] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const [view, setView] = useState<PublicRoomView | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(`ci:${code}:playerId`);
    if (stored) setPlayerId(stored);
    setHydrated(true);
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
    if (!hydrated) return;
    refetch();
  }, [hydrated, refetch]);

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
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-8 text-center">
        <h1 className="font-serif text-3xl italic text-ink">Room not found</h1>
        <p className="text-sm text-ink-soft">
          Code <span className="font-serif italic">{code}</span> doesn&apos;t
          exist.
        </p>
        <button
          onClick={() => router.push("/")}
          className="rounded-sm border border-ink px-5 py-2 text-[11px] uppercase tracking-[0.3em] text-ink transition hover:bg-ink hover:text-page"
        >
          Back home
        </button>
      </main>
    );
  }

  if (!view) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md items-center justify-center">
        <p className="text-[11px] uppercase tracking-[0.3em] text-ink-faint">
          Loading
        </p>
      </main>
    );
  }

  if (!view.you) {
    if (view.state !== "lobby") {
      return (
        <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-8 text-center">
          <h1 className="font-serif text-3xl italic text-ink">
            Game in progress
          </h1>
          <p className="text-sm text-ink-soft">
            This room has already started. Wait for the next round.
          </p>
          <button
            onClick={() => router.push("/")}
            className="rounded-sm border border-ink px-5 py-2 text-[11px] uppercase tracking-[0.3em] text-ink transition hover:bg-ink hover:text-page"
          >
            Back home
          </button>
        </main>
      );
    }
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-8 px-8">
        <div className="text-center">
          <div className="text-[10px] uppercase tracking-[0.4em] text-ink-faint">
            Join room
          </div>
          <div className="mt-2 font-serif text-4xl tracking-[0.3em] text-ink">
            {code}
          </div>
        </div>
        <label className="block w-full">
          <span className="mb-3 block text-[10px] uppercase tracking-[0.3em] text-ink-faint">
            Your name
          </span>
          <input
            value={joinNickname}
            onChange={(e) => setJoinNickname(e.target.value)}
            maxLength={20}
            placeholder="Alice"
            className="w-full border-b border-line bg-transparent px-1 pb-2 text-xl text-ink outline-none transition placeholder:text-ink-faint focus:border-accent"
          />
        </label>
        <button
          onClick={doJoin}
          disabled={joining || joinNickname.trim().length === 0}
          className="w-full rounded-sm bg-ink px-6 py-4 text-[11px] uppercase tracking-[0.3em] text-page transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-30"
        >
          {joining ? "Joining" : "Join"}
        </button>
        {joinError && (
          <p className="border-l-2 border-oxblood bg-oxblood/5 px-4 py-2 text-sm text-oxblood">
            {joinError}
          </p>
        )}
      </main>
    );
  }

  return (
    <RoomPlay
      view={view}
      playerId={view.you.id}
      code={code}
      onRefetch={refetch}
    />
  );
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
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-8 px-8 py-10">
      <header className="flex items-end justify-between border-b border-line pb-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.4em] text-ink-faint">
            Room
          </div>
          <div className="mt-1 font-serif text-2xl tracking-[0.3em] text-ink">
            {code}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-[0.4em] text-ink-faint">
            You
          </div>
          <div className="mt-1 text-sm text-ink">
            {nicknameById.get(playerId)}
            {you.isHost && (
              <span className="ml-2 text-[10px] uppercase tracking-[0.3em] text-accent">
                Host
              </span>
            )}
          </div>
        </div>
      </header>

      {view.state === "lobby" && (
        <LobbyPhase
          view={view}
          playerId={playerId}
          code={code}
          onRefetch={onRefetch}
        />
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[10px] uppercase tracking-[0.4em] text-ink-faint">
      {children}
    </h2>
  );
}

function PlayerList({
  view,
  showScores = true,
}: {
  view: PublicRoomView;
  showScores?: boolean;
}) {
  return (
    <ul className="divide-y divide-line-soft border-y border-line-soft">
      {view.players.map((p) => {
        const { color, initial } = avatarFor(p.id, p.nickname);
        return (
          <li key={p.id} className="flex items-center gap-4 py-3">
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold text-white ${color}`}
            >
              {initial}
            </div>
            <div className="flex-1">
              <div className="text-sm text-ink">
                {p.nickname}
                {p.id === view.hostId && (
                  <span className="ml-2 text-[9px] uppercase tracking-[0.3em] text-accent">
                    Host
                  </span>
                )}
              </div>
            </div>
            {showScores && (
              <div className="font-serif text-lg italic text-ink-soft">
                {p.score}
              </div>
            )}
          </li>
        );
      })}
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
  const [copied, setCopied] = useState(false);
  const isHost = playerId === view.hostId;
  const canStart = view.players.length >= 3;
  const anyScore = view.players.some((p) => p.score > 0);

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
    typeof window !== "undefined"
      ? `${window.location.origin}/room/${code}`
      : "";

  return (
    <>
      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <SectionLabel>
            {anyScore ? "Match Score" : `Players · ${view.players.length}`}
          </SectionLabel>
          {anyScore && (
            <span className="text-[10px] uppercase tracking-[0.3em] text-ink-faint">
              {view.players.length} players
            </span>
          )}
        </div>
        <PlayerList view={view} showScores={anyScore} />
      </section>

      <section className="space-y-3">
        <SectionLabel>Invite</SectionLabel>
        <div className="flex gap-2">
          <input
            readOnly
            value={shareUrl}
            className="flex-1 border-b border-line bg-transparent px-1 pb-1 text-xs text-ink-soft outline-none"
          />
          <button
            onClick={() => {
              navigator.clipboard.writeText(shareUrl);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="text-[10px] uppercase tracking-[0.3em] text-accent transition hover:text-ink"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </section>

      {isHost ? (
        <button
          onClick={start}
          disabled={!canStart || starting}
          className="rounded-sm bg-ink px-6 py-4 text-[11px] uppercase tracking-[0.3em] text-page transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-30"
        >
          {starting
            ? "Starting"
            : canStart
              ? "Begin the game"
              : `Awaiting ${3 - view.players.length} more`}
        </button>
      ) : (
        <p className="text-center text-[11px] uppercase tracking-[0.3em] text-ink-faint">
          Awaiting the host
        </p>
      )}

      {error && (
        <p className="border-l-2 border-oxblood bg-oxblood/5 px-4 py-2 text-sm text-oxblood">
          {error}
        </p>
      )}
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
  const nextTurnIndex =
    view.turnOrder.length > 0
      ? (view.turnIndex + 1) % view.turnOrder.length
      : 0;
  const iAmNext =
    !isMyTurn && view.turnOrder[nextTurnIndex] === playerId;
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
      <section className="border border-line bg-surface p-8 text-center">
        <div className="text-[10px] uppercase tracking-[0.4em] text-ink-faint">
          Category
        </div>
        <div className="mt-3 font-serif text-3xl italic text-ink">
          {view.category}
        </div>
        <div className="mt-6 border-t border-line-soft pt-6">
          {you.isImposter ? (
            <>
              <div className="text-[10px] uppercase tracking-[0.4em] text-oxblood">
                You are the imposter
              </div>
              <div className="mt-2 text-sm leading-relaxed text-ink-soft">
                Bluff. Deduce the secret word from the others&apos; clues.
              </div>
            </>
          ) : (
            <>
              <div className="text-[10px] uppercase tracking-[0.4em] text-leaf">
                Secret word
              </div>
              <div className="mt-2 font-serif text-3xl text-ink">
                {you.secretWord}
              </div>
            </>
          )}
        </div>
      </section>

      <section className="text-center text-[10px] uppercase tracking-[0.4em] text-ink-faint">
        Round {view.round} of {view.totalRounds}
      </section>

      <TurnStrip view={view} playerId={playerId} />

      {isMyTurn ? (
        <div className="space-y-3">
          <SectionLabel>Your one-word clue</SectionLabel>
          <div className="flex gap-2">
            <input
              value={word}
              onChange={(e) => setWord(e.target.value)}
              maxLength={40}
              placeholder="e.g. syrup"
              autoFocus
              className="flex-1 border-b border-line bg-transparent px-1 pb-2 font-serif text-xl italic text-ink outline-none transition placeholder:text-ink-faint focus:border-accent"
              onKeyDown={(e) => {
                if (e.key === "Enter" && word.trim() && !submitting) submit();
              }}
            />
            <button
              onClick={submit}
              disabled={submitting || word.trim().length === 0}
              className="rounded-sm bg-ink px-5 text-[11px] uppercase tracking-[0.3em] text-page transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-30"
            >
              {submitting ? "..." : "Submit"}
            </button>
          </div>
          {error && (
            <p className="border-l-2 border-oxblood bg-oxblood/5 px-4 py-2 text-sm text-oxblood">
              {error}
            </p>
          )}
        </div>
      ) : (
        <p className="text-center text-[11px] uppercase tracking-[0.3em]">
          {iAmNext ? (
            <>
              <span className="text-accent">You&apos;re up next</span>
              <span className="text-ink-faint">
                {" "}
                · Awaiting {nicknameById.get(currentPlayerId)}
              </span>
            </>
          ) : (
            <span className="text-ink-faint">
              Awaiting {nicknameById.get(currentPlayerId)}
            </span>
          )}
        </p>
      )}

      <ClueLog view={view} />
    </>
  );
}

const AVATAR_PALETTE = [
  "bg-[#a8856a]",
  "bg-[#6b7f5c]",
  "bg-[#6a7d94]",
  "bg-[#a67e7b]",
  "bg-[#8a7a9b]",
  "bg-[#b39560]",
  "bg-[#5a8580]",
  "bg-[#9a7357]",
  "bg-[#7d8b6a]",
  "bg-[#8a6b80]",
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
    <section className="-mx-2 flex gap-4 overflow-x-auto px-2 py-3">
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
            className="flex min-w-[64px] flex-col items-center gap-2"
          >
            <div className="relative">
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-full text-base font-semibold text-white transition ${color} ${
                  isCurrent
                    ? "ring-2 ring-accent ring-offset-4 ring-offset-page"
                    : isDone
                      ? "opacity-30"
                      : ""
                }`}
              >
                {initial}
              </div>
              {isDone && (
                <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-leaf text-[10px] text-white">
                  ✓
                </span>
              )}
            </div>
            <span
              className={`max-w-[72px] truncate text-[10px] uppercase tracking-[0.15em] ${
                isCurrent ? "font-semibold text-accent" : "text-ink-faint"
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
    <section className="space-y-4">
      <SectionLabel>Clues</SectionLabel>
      <div className="space-y-5">
        {Object.entries(rounds)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([round, clues]) => (
            <div key={round}>
              <div className="mb-2 text-[10px] uppercase tracking-[0.3em] text-ink-faint">
                Round {round}
              </div>
              <ul className="divide-y divide-line-soft border-y border-line-soft">
                {clues.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-baseline justify-between py-2 text-sm"
                  >
                    <span className="text-ink-soft">
                      {nicknameById.get(c.player_id)}
                    </span>
                    <span className="font-serif text-base italic text-ink">
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
      <section className="border border-line bg-surface p-8 text-center">
        <div className="text-[10px] uppercase tracking-[0.4em] text-ink-faint">
          The category was
        </div>
        <div className="mt-3 font-serif text-2xl italic text-ink">
          {view.category}
        </div>
      </section>

      <ClueLog view={view} />

      <section className="space-y-4">
        <SectionLabel>Who is the imposter?</SectionLabel>
        <div className="divide-y divide-line-soft border-y border-line-soft">
          {view.players.map((p) => {
            const isYou = p.id === playerId;
            const selected = target === p.id;
            const { color, initial } = avatarFor(p.id, p.nickname);
            return (
              <button
                key={p.id}
                onClick={() => !alreadyVoted && !isYou && setTarget(p.id)}
                disabled={alreadyVoted || isYou}
                className={`flex w-full items-center gap-4 py-4 text-left transition ${
                  selected ? "bg-accent/10" : ""
                } ${isYou || alreadyVoted ? "opacity-40" : "hover:bg-cream/40"}`}
              >
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold text-white ${color}`}
                >
                  {initial}
                </div>
                <div className="flex-1 text-sm text-ink">
                  {p.nickname}
                  {isYou && (
                    <span className="ml-2 text-[10px] uppercase tracking-[0.3em] text-ink-faint">
                      (you)
                    </span>
                  )}
                </div>
                {alreadyVoted && myVote.target_id === p.id && (
                  <span className="text-[10px] uppercase tracking-[0.3em] text-accent">
                    Your vote
                  </span>
                )}
                {selected && !alreadyVoted && (
                  <span className="text-[10px] uppercase tracking-[0.3em] text-accent">
                    Selected
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {!alreadyVoted ? (
          <button
            onClick={submit}
            disabled={!target || submitting}
            className="w-full rounded-sm bg-ink px-6 py-4 text-[11px] uppercase tracking-[0.3em] text-page transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-30"
          >
            {submitting ? "Submitting" : "Lock in vote"}
          </button>
        ) : (
          <p className="text-center text-[11px] uppercase tracking-[0.3em] text-ink-faint">
            Vote locked · {votesReceived} of {totalPlayers}
          </p>
        )}
        {error && (
          <p className="border-l-2 border-oxblood bg-oxblood/5 px-4 py-2 text-sm text-oxblood">
            {error}
          </p>
        )}
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

  const youAreImposter = playerId === reveal.imposterId;
  const youWon = youAreImposter ? !caught : caught;
  const pointsEarned = youAreImposter ? (caught ? 0 : 2) : caught ? 1 : 0;
  const outcomeLabel = caught
    ? "Crewmates prevail"
    : tied
      ? "Tied vote · imposter escapes"
      : "Imposter prevails";
  const subtitle = youAreImposter
    ? caught
      ? "They sniffed you out."
      : "You fooled them all."
    : caught
      ? "You caught the imposter."
      : tied
        ? "The vote was tied. Imposter slips away."
        : "The imposter slipped past you.";

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

  return (
    <>
      <section
        className={`border-2 p-10 text-center ${
          youWon
            ? "border-leaf bg-leaf/5"
            : "border-oxblood bg-oxblood/5"
        }`}
      >
        <div
          className={`font-serif text-6xl italic ${
            youWon ? "text-leaf" : "text-oxblood"
          }`}
        >
          {youWon ? "You won" : "You lost"}
        </div>
        <div className="mt-4 text-sm text-ink-soft">{subtitle}</div>
        {pointsEarned > 0 && (
          <div className="mt-5 inline-block border border-ink px-4 py-1 text-[10px] uppercase tracking-[0.3em] text-ink">
            +{pointsEarned} point{pointsEarned === 1 ? "" : "s"}
          </div>
        )}
      </section>

      <section className="border border-line bg-surface p-8 text-center">
        <div className="text-[10px] uppercase tracking-[0.4em] text-ink-faint">
          The imposter was
        </div>
        <div className="mt-3 font-serif text-3xl italic text-oxblood">
          {nicknameById.get(reveal.imposterId)}
        </div>
        <div className="mt-6 border-t border-line-soft pt-6">
          <div className="text-[10px] uppercase tracking-[0.4em] text-ink-faint">
            Secret word
          </div>
          <div className="mt-2 font-serif text-3xl text-ink">
            {reveal.secretWord}
          </div>
          <div className="mt-2 text-xs text-ink-faint">
            Category · {view.category}
          </div>
        </div>
        <div className="mt-5 text-[10px] uppercase tracking-[0.3em] text-ink-soft">
          {outcomeLabel}
        </div>
      </section>

      <section className="space-y-4">
        <SectionLabel>Votes</SectionLabel>
        <ul className="divide-y divide-line-soft border-y border-line-soft">
          {view.votes.map((v, i) => (
            <li
              key={i}
              className="flex items-baseline justify-between py-2 text-sm"
            >
              <span className="text-ink-soft">
                {nicknameById.get(v.voter_id)}
              </span>
              <span className="font-serif italic text-ink">
                → {nicknameById.get(v.target_id)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-4">
        <SectionLabel>Scoreboard</SectionLabel>
        <PlayerList view={{ ...view, players: sortedPlayers }} />
      </section>

      {isHost ? (
        <div className="flex gap-3">
          <button
            onClick={playAgain}
            disabled={restarting}
            className="flex-1 rounded-sm bg-ink px-6 py-4 text-[11px] uppercase tracking-[0.3em] text-page transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-30"
          >
            {restarting ? "..." : "Play again"}
          </button>
          <button
            onClick={() => router.push("/")}
            className="rounded-sm border border-ink px-6 py-4 text-[11px] uppercase tracking-[0.3em] text-ink transition hover:bg-ink hover:text-page"
          >
            Exit
          </button>
        </div>
      ) : (
        <p className="text-center text-[11px] uppercase tracking-[0.3em] text-ink-faint">
          Awaiting the host
        </p>
      )}
    </>
  );
}
