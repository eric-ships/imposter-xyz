"use client";

// Wavelength room body. Rendered inside the existing room page chrome
// (header, you-pill, theme/mute toggles all stay imposter-side). Reads
// view.kind === 'wavelength' from the parent dispatch.
//
// Phases (from view.gameState.phase):
//   lobby     — pre-start, host can begin if ≥3 players
//   clue      — psychic picks a clue word; everyone else waits
//   guessing  — non-psychics drag dial to guess; psychic waits
//   reveal    — target shown, scores update
//   final     — full match scoreboard, host can replay
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { PublicRoomView } from "@/lib/game";
import type { WavelengthPhase, WavelengthState } from "./types";
import { scoreGuess } from "./types";
import {
  playRevealStageChime,
  playTurnChime,
  playVoteCast,
} from "@/lib/audio";
import type { MatchHistoryEntry } from "@/lib/match-history";
import { avatarFor } from "@/lib/avatar";
import { GameKindSwitcher } from "@/components/GameKindSwitcher";
import { GroupAttributionPill } from "@/components/GroupAttributionPill";
import { ShareMatchButton } from "@/components/ShareMatchButton";

// Per-viewer audio cues. Watches state transitions and fires chimes
// for the local player based on what just changed:
//   - clue phase + you are psychic    → playTurnChime ("your turn")
//   - guessing phase + you are guesser → playTurnChime
//   - someone else locked a guess     → playVoteCast (soft thunk)
//   - reveal phase entered             → playRevealStageChime(0)
//   - final phase entered              → playRevealStageChime(2)
//
// Stays silent for the player who just acted (they already know what
// they did) and on the very first render after mount (no spurious
// "you're up" chime when joining mid-game).
function useWavelengthAudio(
  state: WavelengthState | undefined,
  playerId: string
) {
  const prevPhase = useRef<WavelengthPhase | null>(null);
  const prevGuessCount = useRef(0);
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (!state) return;
    const wasFirst = isFirstRender.current;
    isFirstRender.current = false;
    const isPsychic = state.psychicId === playerId;

    // Phase transitions.
    if (prevPhase.current !== state.phase) {
      const prev = prevPhase.current;
      prevPhase.current = state.phase;
      if (!wasFirst) {
        if (state.phase === "clue" && prev !== "clue") {
          if (isPsychic) playTurnChime();
        } else if (state.phase === "guessing" && prev !== "guessing") {
          if (!isPsychic) playTurnChime();
        } else if (state.phase === "reveal" && prev !== "reveal") {
          playRevealStageChime(0);
        } else if (state.phase === "final" && prev !== "final") {
          playRevealStageChime(2);
        }
      }
    }

    // Guess-lock-in cues. Fires for everyone except the player who
    // just locked in (they don't need to hear their own click).
    if (state.phase === "guessing") {
      if (state.guesses.length > prevGuessCount.current && !wasFirst) {
        const newest = state.guesses[state.guesses.length - 1];
        if (newest.playerId !== playerId) playVoteCast();
      }
      prevGuessCount.current = state.guesses.length;
    } else {
      prevGuessCount.current = 0;
    }
  }, [state, playerId]);
}

export function WavelengthBody({
  view,
  playerId,
  code,
  userId,
}: {
  view: PublicRoomView;
  playerId: string;
  code: string;
  userId: string | null;
}) {
  const isHost = view.hostId === playerId;
  const nicknameById = useMemo(
    () => new Map(view.players.map((p) => [p.id, p.nickname])),
    [view.players]
  );

  // Audio cues fire for whatever phase the viewer is in. Pass the raw
  // gameState (undefined when in lobby pre-start; the hook no-ops).
  useWavelengthAudio(
    view.gameState as unknown as WavelengthState | undefined,
    playerId
  );

  // The lobby state is signaled by view.state === 'lobby'. Once the
  // host hits start, view.state becomes 'playing' and the actual
  // sub-phase lives in gameState.phase.
  if (view.state === "lobby") {
    return (
      <WavelengthLobby
        view={view}
        playerId={playerId}
        code={code}
        isHost={isHost}
        userId={userId}
      />
    );
  }

  const state = view.gameState as unknown as WavelengthState | undefined;
  if (!state || !state.phase) {
    return (
      <p className="text-center text-sm text-ink-soft">Loading match…</p>
    );
  }

  return (
    <WavelengthMatch
      view={view}
      playerId={playerId}
      code={code}
      isHost={isHost}
      state={state}
      nicknameById={nicknameById}
    />
  );
}

// ─── Lobby ─────────────────────────────────────────────────────────

function WavelengthLobby({
  view,
  playerId,
  code,
  isHost,
  userId,
}: {
  view: PublicRoomView;
  playerId: string;
  code: string;
  isHost: boolean;
  userId: string | null;
}) {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canStart = view.players.length >= 3;

  async function start() {
    setError(null);
    setStarting(true);
    try {
      const res = await fetch(`/api/rooms/${code}/wavelength/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
      setStarting(false);
    }
  }

  return (
    <div className="space-y-7">
      <GameKindSwitcher
        code={code}
        playerId={playerId}
        isHost={isHost}
        currentKind={view.kind}
      />

      <div>
        <GroupAttributionPill
          code={code}
          playerId={playerId}
          userId={userId}
          isHost={isHost}
          isLobby
          currentGroupId={view.groupId}
          currentGroupName={view.groupName}
        />
      </div>

      <section className="space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-ink-faint">
          Players · {view.players.length} of 6
        </h2>
        <ul className="divide-y divide-line-soft border-y border-line-soft">
          {view.players.map((p) => {
            const av = avatarFor(p.id, p.nickname, p.avatar, view.players);
            return (
              <li key={p.id} className="flex items-center gap-3 py-3">
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${av.color} ${
                    av.isCustom
                      ? "border-2 border-line text-base"
                      : "text-sm font-semibold text-white"
                  }`}
                >
                  {av.initial}
                </div>
                <span className="text-sm text-ink">
                  {p.nickname}
                  {p.id === view.hostId && (
                    <span className="ml-2 text-[10px] font-bold uppercase tracking-[0.12em] text-accent">
                      Host
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-3 rounded-xl border-2 border-line-soft bg-surface/40 p-4">
        <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-ink-faint">
          How Wavelength works
        </h3>
        <p className="text-sm text-ink-soft">
          Each round one player is the <em>psychic</em>. They see a hidden
          target on a spectrum (e.g. <span className="text-ink">Cold ↔ Hot</span>)
          and pick a clue word the rest of the table tries to dial in on.
          Closer to the target = more points. Psychic earns the average of
          their guessers&apos; scores.
        </p>
      </section>

      {isHost ? (
        <button
          onClick={start}
          disabled={!canStart || starting}
          className="w-full rounded-2xl bg-accent px-6 py-4 text-base font-bold tracking-tight text-white shadow-sm transition-all duration-100 hover:brightness-110 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-30"
        >
          {starting
            ? "Starting…"
            : !canStart
              ? `Awaiting ${3 - view.players.length} more`
              : "Begin the match"}
        </button>
      ) : (
        <p className="text-center text-xs font-bold uppercase tracking-[0.14em] text-ink-faint">
          Awaiting the host
        </p>
      )}

      {error && (
        <p className="border-l-2 border-oxblood bg-oxblood/5 px-4 py-2 text-sm text-oxblood">
          {error}
        </p>
      )}

      <WavelengthHistoryPanel history={view.matchHistory ?? []} />
    </div>
  );
}

// Lobby-scoped match history. Discriminates the union and renders both
// imposter and wavelength entries so a mixed lobby (host could've
// played one then the other) reads coherently. Mirrors the panel
// layout from the imposter lobby.
function WavelengthHistoryPanel({
  history,
}: {
  history: MatchHistoryEntry[];
}) {
  if (history.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-ink-faint">
        Past matches · {history.length}
      </h2>
      <div className="space-y-2">
        {history.map((m) => {
          let endedTime = "";
          try {
            endedTime = new Date(m.endedAt).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            });
          } catch {
            /* ignore */
          }
          if ("kind" in m && m.kind === "just-one") {
            return (
              <div
                key={`j${m.matchNumber}`}
                className="rounded-xl border-2 border-line-soft bg-page/40 px-3 py-2.5"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                    Match {m.matchNumber} · Just One
                    {endedTime && <> · {endedTime}</>}
                  </div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-leaf">
                    {m.score} / {m.totalCards}
                  </div>
                </div>
                <div className="mt-1 text-sm text-ink-soft">
                  {m.rating}
                </div>
              </div>
            );
          }
          if ("kind" in m && m.kind === "wavelength") {
            const winnerNames = m.winnerIds
              .map(
                (id) =>
                  m.perPlayer.find((p) => p.playerId === id)?.nickname ?? "?"
              )
              .join(" & ");
            return (
              <div
                key={`w${m.matchNumber}`}
                className="rounded-xl border-2 border-line-soft bg-page/40 px-3 py-2.5"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                    Match {m.matchNumber} · Wavelength
                    {endedTime && <> · {endedTime}</>}
                  </div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-leaf">
                    {m.winnerIds.length === 1 ? "Winner" : "Tied"}
                  </div>
                </div>
                <div className="mt-1 text-sm text-ink">
                  <span className="font-semibold">{winnerNames}</span>
                  <span className="ml-2 text-ink-faint">
                    · {m.topScore} points · {m.totalRounds} rounds
                  </span>
                </div>
              </div>
            );
          }
          if ("kind" in m && m.kind === "crew") {
            const tasksDone = m.perPlayer.filter(
              (p) => p.taskDone
            ).length;
            const won = m.outcome === "won";
            return (
              <div
                key={`c${m.matchNumber}`}
                className="rounded-xl border-2 border-line-soft bg-page/40 px-3 py-2.5"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                    Match {m.matchNumber} · Crew
                    {endedTime && <> · {endedTime}</>}
                  </div>
                  <div
                    className={`text-[11px] font-bold uppercase tracking-[0.14em] ${
                      won ? "text-leaf" : "text-oxblood"
                    }`}
                  >
                    {won ? "Mission won" : "Mission lost"}
                  </div>
                </div>
                <div className="mt-1 text-sm text-ink">
                  <span className="font-semibold">
                    {tasksDone} / {m.taskCount}
                  </span>
                  <span className="ml-2 text-ink-faint">
                    tasks completed
                  </span>
                </div>
              </div>
            );
          }
          if ("kind" in m && m.kind === "hold") {
            const victory = m.outcome === "victory";
            return (
              <div
                key={`h${m.matchNumber}`}
                className="rounded-xl border-2 border-line-soft bg-page/40 px-3 py-2.5"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                    Match {m.matchNumber} · Hold
                    {endedTime && <> · {endedTime}</>}
                  </div>
                  <div
                    className={`text-[11px] font-bold uppercase tracking-[0.14em] ${
                      victory ? "text-leaf" : "text-oxblood"
                    }`}
                  >
                    {victory ? "Held the line" : "Core breached"}
                  </div>
                </div>
                <div className="mt-1 text-sm text-ink">
                  <span className="font-semibold">
                    Wave {m.waveReached} / {m.totalWaves}
                  </span>
                  <span className="ml-2 text-ink-faint">
                    · core {m.coreHp} HP
                  </span>
                </div>
              </div>
            );
          }
          // Imposter entry (kind missing or 'imposter')
          const winnerLabel =
            m.winner === "imposter"
              ? "Imposter wins"
              : m.winner === "crewmates"
                ? "Crewmates win"
                : "Split point";
          const winnerColor =
            m.winner === "imposter"
              ? "text-oxblood"
              : m.winner === "crewmates"
                ? "text-leaf"
                : "text-accent";
          return (
            <div
              key={`i${m.matchNumber}`}
              className="rounded-xl border-2 border-line-soft bg-page/40 px-3 py-2.5"
            >
              <div className="flex items-baseline justify-between gap-3">
                <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                  Match {m.matchNumber} · Imposter
                  {endedTime && <> · {endedTime}</>}
                </div>
                <div
                  className={`text-[11px] font-bold uppercase tracking-[0.14em] ${winnerColor}`}
                >
                  {winnerLabel}
                </div>
              </div>
              <div className="mt-1 text-sm text-ink">
                <span className="text-ink-faint">{m.category}</span>
                <span className="mx-1.5 text-ink-faint">·</span>
                <span className="font-semibold">{m.secretWord}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ─── Match (clue / guessing / reveal / final) ──────────────────────

function WavelengthMatch({
  view,
  playerId,
  code,
  isHost,
  state,
  nicknameById,
}: {
  view: PublicRoomView;
  playerId: string;
  code: string;
  isHost: boolean;
  state: WavelengthState;
  nicknameById: Map<string, string>;
}) {
  const isPsychic = state.psychicId === playerId;
  const psychicName = state.psychicId
    ? (nicknameById.get(state.psychicId) ?? "?")
    : "?";

  // Countdown drives the deadline-driven expiry. Hits 0 → the local
  // tab pokes /expire (idempotent on the server). Any tab can fire
  // it; the server-side deadline check is the source of truth.
  useDeadlineExpire(state.deadline, code);

  // Pop a small toast at the bottom of the viewport when someone
  // else's guess lands, so the table feels the lock-ins land in real
  // time. Skips the local player (they already know they pressed it).
  const toasts = useGuessLockToasts(state, view.players, playerId);

  if (state.phase === "final") {
    return (
      <WavelengthFinal
        view={view}
        playerId={playerId}
        code={code}
        isHost={isHost}
        state={state}
        nicknameById={nicknameById}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Round + psychic header. Timer is the dominant element on the
          right; round and psychic stack as small chrome on the left. */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-bold uppercase tracking-[0.14em] text-ink-faint">
            Round {state.round} of {state.totalRounds}
          </span>
          <span className="text-xs font-bold uppercase tracking-[0.14em] text-ink-faint">
            Psychic ·{" "}
            <span className="text-accent">
              {isPsychic ? "you" : psychicName}
            </span>
          </span>
        </div>
        <CountdownPill deadline={state.deadline} />
      </div>

      {/* Concept pair */}
      {state.concept && (
        <div className="flex items-center justify-between gap-4 border-y border-line-soft py-4">
          <span className="font-serif text-xl text-ink">
            {state.concept.left}
          </span>
          <span className="text-ink-faint">↔</span>
          <span className="font-serif text-xl text-ink">
            {state.concept.right}
          </span>
        </div>
      )}

      {/* Phase-specific body */}
      {state.phase === "clue" &&
        (isPsychic ? (
          <PsychicCluePhase
            state={state}
            code={code}
            playerId={playerId}
          />
        ) : (
          <WaitingForClue psychicName={psychicName} />
        ))}

      {state.phase === "guessing" &&
        (isPsychic ? (
          <PsychicWaitingForGuesses
            state={state}
            view={view}
            nicknameById={nicknameById}
          />
        ) : (
          <GuesserPhase
            state={state}
            code={code}
            playerId={playerId}
          />
        ))}

      {state.phase === "reveal" && (
        <RevealPhase
          state={state}
          view={view}
          isHost={isHost}
          code={code}
          playerId={playerId}
          nicknameById={nicknameById}
        />
      )}

      {/* Cumulative scores */}
      <ScoreBoard
        scores={state.scores}
        roundScores={
          state.phase === "reveal" ? state.roundScores : undefined
        }
        players={view.players}
        psychicId={state.psychicId}
      />

      {/* Guess-lock toasts: pinned to bottom-center, auto-dismiss in
           ~2.4s. Stacks if multiple guesses land in the same render. */}
      <div
        className="pointer-events-none fixed inset-x-0 z-40 flex flex-col items-center gap-2"
        style={{ bottom: "max(env(safe-area-inset-bottom), 1.5rem)" }}
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 380, damping: 28 }}
              className="rounded-full border-2 border-line bg-surface px-4 py-2 text-sm text-ink shadow-lg"
            >
              <span className="font-semibold text-ink">{t.nickname}</span>
              <span className="ml-2 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-faint">
                locked in
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

// Watches state.guesses; on each new entry that isn't the local
// player, drops a "X locked in" toast at the bottom of the screen.
// Initial mount seeds the seen set with whatever guesses already
// exist so a refresh mid-round doesn't spam toasts for past locks.
function useGuessLockToasts(
  state: WavelengthState | undefined,
  players: PublicRoomView["players"],
  playerId: string
): { id: number; nickname: string }[] {
  const seenGuessers = useRef<Set<string>>(new Set());
  const seededFor = useRef<string | null>(null); // round key
  const idRef = useRef(0);
  const [toasts, setToasts] = useState<
    { id: number; nickname: string }[]
  >([]);

  useEffect(() => {
    if (!state || state.phase !== "guessing") {
      // Reset between rounds so the next guessing phase starts fresh.
      seenGuessers.current = new Set();
      seededFor.current = null;
      return;
    }
    const roundKey = `${state.round}`;
    if (seededFor.current !== roundKey) {
      seenGuessers.current = new Set(
        state.guesses.map((g) => g.playerId)
      );
      seededFor.current = roundKey;
      return;
    }
    const fresh: string[] = [];
    for (const g of state.guesses) {
      if (!seenGuessers.current.has(g.playerId)) {
        seenGuessers.current.add(g.playerId);
        if (g.playerId !== playerId) fresh.push(g.playerId);
      }
    }
    if (fresh.length === 0) return;
    for (const fid of fresh) {
      const nickname =
        players.find((p) => p.id === fid)?.nickname ?? "?";
      const id = ++idRef.current;
      setToasts((prev) => [...prev, { id, nickname }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 2400);
    }
  }, [state, players, playerId]);

  return toasts;
}

function WaitingForClue({ psychicName }: { psychicName: string }) {
  return (
    <div className="rounded-xl border-2 border-line-soft bg-surface/40 p-6 text-center">
      <p className="text-sm text-ink-soft">
        <span className="text-ink">{psychicName}</span> is reading the
        target…
      </p>
    </div>
  );
}

function PsychicCluePhase({
  state,
  code,
  playerId,
}: {
  state: WavelengthState;
  code: string;
  playerId: string;
}) {
  const [word, setWord] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const trimmed = word.trim();
    if (trimmed.length === 0) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/rooms/${code}/wavelength/clue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, word: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <SpectrumDial
        mode="psychic-clue"
        target={state.target ?? 50}
        targetWidth={state.targetWidth}
        concept={state.concept}
      />
      <p className="text-center text-sm text-ink-soft">
        Pick a clue word that lands on the target.
      </p>
      <div className="flex gap-2">
        <input
          value={word}
          onChange={(e) => setWord(e.target.value)}
          maxLength={64}
          placeholder="e.g. Lukewarm"
          autoFocus
          type="text"
          name="wavelength-clue"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          data-form-type="other"
          data-1p-ignore="true"
          data-lpignore="true"
          className="min-w-0 flex-1 rounded-xl border-2 border-line bg-surface/40 px-4 py-3 font-serif text-2xl text-ink outline-none transition placeholder:text-ink-faint/70 focus:border-accent"
          onKeyDown={(e) => {
            if (e.key === "Enter" && word.trim() && !submitting) submit();
          }}
        />
        <button
          onClick={submit}
          disabled={submitting || word.trim().length === 0}
          className="rounded-xl bg-ink px-5 text-[11px] font-semibold uppercase tracking-[0.2em] text-page transition-all duration-100 hover:bg-accent active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-30"
        >
          {submitting ? "…" : "Submit"}
        </button>
      </div>
      {error && (
        <p className="border-l-2 border-oxblood bg-oxblood/5 px-4 py-2 text-sm text-oxblood">
          {error}
        </p>
      )}
    </div>
  );
}

function PsychicWaitingForGuesses({
  state,
  view,
  nicknameById,
}: {
  state: WavelengthState;
  view: PublicRoomView;
  nicknameById: Map<string, string>;
}) {
  const guesserIds = view.players
    .map((p) => p.id)
    .filter((id) => id !== state.psychicId);
  const guessedSet = new Set(state.guesses.map((g) => g.playerId));
  return (
    <div className="space-y-5">
      <ClueDisplay clue={state.clue ?? ""} />
      <SpectrumDial
        mode="psychic-clue"
        target={state.target ?? 50}
        targetWidth={state.targetWidth}
        concept={state.concept}
      />
      <p className="text-center text-sm text-ink-soft">
        Waiting on guesses · {state.guesses.length} of {guesserIds.length}
      </p>
      <ul className="flex flex-wrap justify-center gap-2">
        {guesserIds.map((id) => {
          const guessed = guessedSet.has(id);
          return (
            <li
              key={id}
              className={`rounded-full border-2 px-3 py-1 text-xs font-semibold ${
                guessed
                  ? "border-leaf bg-leaf/10 text-leaf"
                  : "border-line text-ink-soft"
              }`}
            >
              {nicknameById.get(id) ?? "?"}
              {guessed && <span className="ml-1.5">✓</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function GuesserPhase({
  state,
  code,
  playerId,
}: {
  state: WavelengthState;
  code: string;
  playerId: string;
}) {
  const myGuess = state.guesses.find((g) => g.playerId === playerId);
  const [position, setPosition] = useState<number>(myGuess?.position ?? 50);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(!!myGuess);

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/rooms/${code}/wavelength/guess`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, position }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
      setLocked(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <ClueDisplay clue={state.clue ?? ""} />
      <SpectrumDial
        mode={locked ? "guess-locked" : "guess"}
        value={position}
        onChange={locked ? undefined : setPosition}
        targetWidth={state.targetWidth}
        concept={state.concept}
      />
      <p className="text-center text-sm text-ink-soft">
        {locked
          ? "Guess locked. Waiting on the rest of the table."
          : "Drag the dial to where the clue lands."}
      </p>
      {!locked && (
        <button
          onClick={submit}
          disabled={submitting}
          className="w-full rounded-2xl bg-accent px-6 py-4 text-base font-bold tracking-tight text-white shadow-sm transition-all duration-100 hover:brightness-110 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-30"
        >
          {submitting ? "Locking in…" : "Lock in guess"}
        </button>
      )}
      {error && (
        <p className="border-l-2 border-oxblood bg-oxblood/5 px-4 py-2 text-sm text-oxblood">
          {error}
        </p>
      )}
    </div>
  );
}

function RevealPhase({
  state,
  view,
  isHost,
  code,
  playerId,
  nicknameById,
}: {
  state: WavelengthState;
  view: PublicRoomView;
  isHost: boolean;
  code: string;
  playerId: string;
  nicknameById: Map<string, string>;
}) {
  const [advancing, setAdvancing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function next() {
    setError(null);
    setAdvancing(true);
    try {
      const res = await fetch(
        `/api/rooms/${code}/wavelength/next-round`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerId }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
      setAdvancing(false);
    }
  }

  const target = state.target ?? 50;
  const isLastRound = state.round >= state.totalRounds;
  // Did everyone hit bullseye this round? Drives the celebratory
  // banner. Mirrors the server-side condition exactly (raw band score
  // === 4 for every guess).
  const allBullseye =
    state.guesses.length > 0 &&
    state.guesses.every(
      (g) => scoreGuess(g.position, target, state.targetWidth) === 4
    );
  // Decorate guesses with nickname + avatar so the dial pins can
  // render the player's circle. avatarFor uses joined-order indexing
  // off view.players so colors match the rest of the room chrome.
  const decoratedGuesses = state.guesses.map((g) => {
    const p = view.players.find((vp) => vp.id === g.playerId);
    const av = avatarFor(
      g.playerId,
      p?.nickname ?? "?",
      p?.avatar ?? null,
      view.players
    );
    return {
      ...g,
      nickname: p?.nickname ?? "?",
      avatar: av,
      score: scoreGuess(g.position, target, state.targetWidth),
    };
  });

  return (
    <div className="space-y-5">
      <ClueDisplay clue={state.clue ?? ""} />
      <SpectrumDial
        mode="reveal"
        target={target}
        targetWidth={state.targetWidth}
        guesses={decoratedGuesses}
        concept={state.concept}
      />

      {allBullseye && (
        <motion.div
          initial={{ opacity: 0, scale: 0.85, y: -6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 360, damping: 22 }}
          className="rounded-xl border-2 border-leaf bg-leaf/10 px-4 py-3 text-center"
        >
          <div className="text-xs font-bold uppercase tracking-[0.14em] text-leaf">
            Unanimous bullseye
          </div>
          <div className="mt-1 text-sm text-ink">
            Everyone +2 bonus
          </div>
        </motion.div>
      )}

      {/* Per-guess scores */}
      <ul className="divide-y divide-line-soft border-y border-line-soft">
        {decoratedGuesses
          .sort((a, b) => b.score - a.score)
          .map((g) => (
            <li
              key={g.playerId}
              className="flex items-baseline justify-between py-2"
            >
              <span className="text-sm text-ink">{g.nickname}</span>
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                guessed {Math.round(g.position)}
                <span
                  className={`ml-3 inline-block min-w-[2.25rem] rounded-full px-2 py-0.5 text-center text-[10px] font-semibold tabular-nums ${
                    g.score === 4
                      ? "bg-leaf text-white"
                      : g.score === 3
                        ? "bg-leaf/40 text-leaf"
                        : g.score === 2
                          ? "bg-accent/30 text-accent"
                          : "bg-line text-ink-faint"
                  }`}
                >
                  +{g.score}
                </span>
              </span>
            </li>
          ))}
        {state.psychicId && (
          <li className="flex items-baseline justify-between py-2">
            <span className="text-sm text-ink">
              {nicknameById.get(state.psychicId) ?? "?"}
              <span className="ml-2 text-[10px] font-bold uppercase tracking-[0.12em] text-accent">
                Psychic
              </span>
            </span>
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-faint">
              best of table
              <span className="ml-3 inline-block min-w-[2.25rem] rounded-full bg-accent/20 px-2 py-0.5 text-center text-[10px] font-semibold tabular-nums text-accent">
                +{state.roundScores[state.psychicId] ?? 0}
              </span>
            </span>
          </li>
        )}
      </ul>

      {isHost ? (
        <button
          onClick={next}
          disabled={advancing}
          className="w-full rounded-2xl bg-accent px-6 py-4 text-base font-bold tracking-tight text-white shadow-sm transition-all duration-100 hover:brightness-110 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-30"
        >
          {advancing
            ? "…"
            : isLastRound
              ? "Show final scores"
              : "Next round"}
        </button>
      ) : (
        <p className="text-center text-xs font-bold uppercase tracking-[0.14em] text-ink-faint">
          {isLastRound
            ? "Awaiting the host for the final scores"
            : "Awaiting the host for the next round"}
        </p>
      )}

      {error && (
        <p className="border-l-2 border-oxblood bg-oxblood/5 px-4 py-2 text-sm text-oxblood">
          {error}
        </p>
      )}
    </div>
  );
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  void view;
}

function WavelengthFinal({
  view,
  playerId,
  code,
  isHost,
  state,
  nicknameById,
}: {
  view: PublicRoomView;
  playerId: string;
  code: string;
  isHost: boolean;
  state: WavelengthState;
  nicknameById: Map<string, string>;
}) {
  const [restarting, setRestarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sorted = view.players
    .map((p) => ({
      id: p.id,
      nickname: p.nickname,
      score: state.scores[p.id] ?? 0,
    }))
    .sort((a, b) => b.score - a.score);
  const topScore = sorted[0]?.score ?? 0;
  const winners = sorted.filter((p) => p.score === topScore);
  const youWon = winners.some((w) => w.id === playerId);

  async function replay() {
    setError(null);
    setRestarting(true);
    try {
      const res = await fetch(
        `/api/rooms/${code}/wavelength/next-round`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerId }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
      setRestarting(false);
    }
  }

  return (
    <div className="space-y-7">
      <section
        className={`rounded-xl border-2 p-8 text-center ${
          youWon ? "border-leaf bg-leaf/5" : "border-line bg-surface/40"
        }`}
      >
        <div className="text-xs font-bold uppercase tracking-[0.14em] text-ink-faint">
          {winners.length === 1 ? "Winner" : "Tied"}
        </div>
        <div
          className={`mt-3 font-serif text-4xl ${
            youWon ? "text-leaf" : "text-ink"
          }`}
        >
          {winners.map((w) => w.nickname).join(" & ")}
        </div>
        <div className="mt-2 text-sm text-ink-soft">
          {topScore} points
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-ink-faint">
          Final scoreboard
        </h2>
        <ul className="divide-y divide-line-soft border-y border-line-soft">
          {sorted.map((p, i) => {
            const playerRow = view.players.find((vp) => vp.id === p.id);
            const av = avatarFor(
              p.id,
              p.nickname,
              playerRow?.avatar ?? null,
              view.players
            );
            return (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <span className="flex items-center gap-3">
                  <span className="w-4 text-right text-sm text-ink-faint tabular-nums">
                    {i + 1}
                  </span>
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${av.color} ${
                      av.isCustom
                        ? "border-2 border-line text-sm"
                        : "text-xs font-semibold text-white"
                    }`}
                  >
                    {av.initial}
                  </div>
                  <span className="text-sm text-ink">{p.nickname}</span>
                  {p.id === playerId && (
                    <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-faint">
                      you
                    </span>
                  )}
                </span>
                <span className="text-lg text-ink-soft tabular-nums">
                  {p.score}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {isHost ? (
        <button
          onClick={replay}
          disabled={restarting}
          className="w-full rounded-2xl bg-accent px-6 py-4 text-base font-bold tracking-tight text-white shadow-sm transition-all duration-100 hover:brightness-110 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-30"
        >
          {restarting ? "…" : "Back to lobby"}
        </button>
      ) : (
        <p className="text-center text-xs font-bold uppercase tracking-[0.14em] text-ink-faint">
          Awaiting the host
        </p>
      )}

      <ShareMatchButton code={code} kind="wavelength" />

      {error && (
        <p className="border-l-2 border-oxblood bg-oxblood/5 px-4 py-2 text-sm text-oxblood">
          {error}
        </p>
      )}

      {/* eslint-disable-next-line @typescript-eslint/no-unused-vars */}
      <span className="hidden">
        {nicknameById.size}
      </span>
    </div>
  );
}

// Polls /expire when the local clock crosses the deadline. Server is
// idempotent (re-checks the actual deadline) so racing tabs are fine.
// One-shot per deadline: ref tracks the deadline string we last fired
// for so a stale "still past deadline" view doesn't spam the route.
function useDeadlineExpire(deadline: string | null, code: string) {
  const firedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!deadline) return;
    if (firedFor.current === deadline) return;
    const ms = new Date(deadline).getTime() - Date.now();
    if (ms <= 0) {
      firedFor.current = deadline;
      fetch(`/api/rooms/${code}/wavelength/expire`, {
        method: "POST",
      }).catch(() => {});
      return;
    }
    const timer = setTimeout(() => {
      firedFor.current = deadline;
      fetch(`/api/rooms/${code}/wavelength/expire`, {
        method: "POST",
      }).catch(() => {});
    }, ms + 250); // 250ms grace so client clock skew doesn't fire early
    return () => clearTimeout(timer);
  }, [deadline, code]);
}

// Small "0:32" countdown pill. Re-renders every second. Hidden when
// no deadline (reveal/final/lobby phases). Goes oxblood under 10s.
function CountdownPill({ deadline }: { deadline: string | null }) {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (!deadline) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [deadline]);
  if (!deadline) return null;
  const remaining = Math.max(
    0,
    Math.ceil((new Date(deadline).getTime() - now) / 1000)
  );
  const urgent = remaining <= 10;
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  // Big tabular-nums readout. Pulses gently when under 10s so the
  // pressure is felt at a glance from across the room.
  return (
    <motion.span
      animate={
        urgent ? { scale: [1, 1.08, 1] } : { scale: 1 }
      }
      transition={
        urgent
          ? { duration: 1, repeat: Infinity, ease: "easeInOut" }
          : { duration: 0 }
      }
      className={`text-4xl font-semibold leading-none tabular-nums ${
        urgent ? "text-oxblood" : "text-ink"
      }`}
    >
      {mins}:{secs.toString().padStart(2, "0")}
    </motion.span>
  );
}

function ClueDisplay({ clue }: { clue: string }) {
  return (
    <div className="text-center">
      <div className="text-xs font-bold uppercase tracking-[0.14em] text-ink-faint">
        Clue
      </div>
      <div className="mt-1 font-serif text-3xl italic text-ink">{clue}</div>
    </div>
  );
}

function ScoreBoard({
  scores,
  roundScores,
  players,
  psychicId,
}: {
  scores: Record<string, number>;
  roundScores?: Record<string, number>;
  players: PublicRoomView["players"];
  psychicId: string | null;
}) {
  const entries = players
    .map((p) => ({
      id: p.id,
      nickname: p.nickname,
      avatar: p.avatar,
      total: scores[p.id] ?? 0,
      delta: roundScores?.[p.id] ?? 0,
      isPsychic: p.id === psychicId,
    }))
    .sort((a, b) => b.total - a.total);
  if (entries.length === 0) return null;
  return (
    <section className="space-y-2 rounded-xl border-2 border-line-soft bg-surface/40 p-3">
      <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-ink-faint">
        Scoreboard
      </h3>
      <ul className="divide-y divide-line-soft">
        {entries.map((e) => {
          const av = avatarFor(e.id, e.nickname, e.avatar, players);
          return (
            <li
              key={e.id}
              className="flex items-center justify-between py-1.5"
            >
              <span className="flex items-center gap-2.5">
                <div
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${av.color} ${
                    av.isCustom
                      ? "border-2 border-line text-xs"
                      : "text-[10px] font-semibold text-white"
                  }`}
                >
                  {av.initial}
                </div>
                <span className="text-sm text-ink">
                  {e.nickname}
                  {e.isPsychic && (
                    <span className="ml-2 text-[10px] font-bold uppercase tracking-[0.12em] text-accent">
                      psychic
                    </span>
                  )}
                </span>
              </span>
              <span className="flex items-baseline gap-2">
                {roundScores && e.delta > 0 && (
                  <span className="rounded-full bg-leaf/10 px-1.5 text-[10px] font-semibold tabular-nums text-leaf">
                    +{e.delta}
                  </span>
                )}
                <span className="text-base tabular-nums text-ink-soft">
                  {e.total}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ─── Spectrum dial ─────────────────────────────────────────────────

type DialMode = "psychic-clue" | "guess" | "guess-locked" | "reveal";

function SpectrumDial({
  mode,
  value,
  onChange,
  target,
  targetWidth,
  guesses,
  concept,
}: {
  mode: DialMode;
  value?: number;
  onChange?: (v: number) => void;
  target?: number;
  targetWidth: number;
  guesses?: {
    playerId: string;
    position: number;
    nickname: string;
    score: number;
    avatar: { color: string; initial: string; isCustom: boolean };
  }[];
  concept: { left: string; right: string } | null;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const showTarget = mode === "psychic-clue" || mode === "reveal";

  const updateFromPointer = (e: React.PointerEvent | PointerEvent) => {
    if (!onChange || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const raw = ((e.clientX - rect.left) / rect.width) * 100;
    const clamped = Math.max(0, Math.min(100, raw));
    onChange(Math.round(clamped));
  };

  // Pointer drag handlers (mouse + touch via pointer events).
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => updateFromPointer(e);
    const onUp = () => setDragging(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);

  // Width math: bullseye center is at `target`, width = targetWidth.
  // Outer bands extend ±2× and ±3× the width.
  const interactive = mode === "guess" && !!onChange;

  return (
    <div className="space-y-2 select-none">
      <div
        ref={trackRef}
        onPointerDown={(e) => {
          if (!interactive) return;
          e.preventDefault();
          (e.target as Element).setPointerCapture?.(e.pointerId);
          setDragging(true);
          updateFromPointer(e);
        }}
        className={`relative h-16 rounded-xl border-2 border-line bg-surface ${
          interactive ? "cursor-pointer touch-none" : ""
        }`}
      >
        {/* Target bands (only when visible) */}
        {showTarget && target !== undefined && (
          <>
            {/* Outer band (2pt) */}
            <div
              className="absolute top-0 h-full bg-accent/15"
              style={{
                left: `${Math.max(0, target - targetWidth * 3)}%`,
                width: `${Math.min(100, targetWidth * 6)}%`,
              }}
            />
            {/* Inner band (3pt) */}
            <div
              className="absolute top-0 h-full bg-accent/30"
              style={{
                left: `${Math.max(0, target - targetWidth * 2)}%`,
                width: `${Math.min(100, targetWidth * 4)}%`,
              }}
            />
            {/* Bullseye (4pt) */}
            <div
              className="absolute top-0 h-full bg-accent/60"
              style={{
                left: `${Math.max(0, target - targetWidth)}%`,
                width: `${Math.min(100, targetWidth * 2)}%`,
              }}
            />
            {/* Center line */}
            <div
              className="absolute top-0 h-full w-px bg-ink"
              style={{ left: `${target}%` }}
            />
          </>
        )}

        {/* Tick marks (visual only) */}
        <div className="absolute inset-x-0 bottom-1 flex justify-between px-1">
          {Array.from({ length: 11 }).map((_, i) => (
            <div
              key={i}
              className={`w-px ${i % 5 === 0 ? "h-2 bg-ink-faint" : "h-1 bg-ink-faint/40"}`}
            />
          ))}
        </div>

        {/* Reveal-phase guess pins. Avatar circle floats above the
             pin so the dial doesn't get visually cluttered with
             nicknames at every position. Hover the circle for the
             name + score via the title attr; the per-guess scoring
             list below the dial covers the explicit detail. */}
        {mode === "reveal" &&
          guesses?.map((g) => (
            <div
              key={g.playerId}
              className="absolute top-0 -translate-x-1/2"
              style={{ left: `${g.position}%` }}
              title={`${g.nickname}: +${g.score}`}
            >
              <div className="h-16 w-px bg-ink-soft" />
              <div
                className={`absolute -top-7 left-1/2 -translate-x-1/2 flex h-6 w-6 items-center justify-center rounded-full border-2 border-page ${g.avatar.color} ${
                  g.avatar.isCustom
                    ? "text-xs"
                    : "text-[10px] font-semibold text-white"
                }`}
              >
                {g.avatar.initial}
              </div>
            </div>
          ))}

        {/* Live guess marker */}
        {(mode === "guess" || mode === "guess-locked") &&
          value !== undefined && (
            <motion.div
              className="absolute top-0 -translate-x-1/2"
              style={{ left: `${value}%` }}
              animate={{ scale: dragging ? 1.05 : 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 28 }}
            >
              <div
                className={`h-16 w-1 rounded-sm ${
                  mode === "guess-locked" ? "bg-leaf" : "bg-accent"
                }`}
              />
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 rounded-full border-2 border-line bg-page px-2 py-0.5 text-[10px] tabular-nums text-ink-soft">
                {value}
              </div>
            </motion.div>
          )}
      </div>

      {/* Concept labels under the track */}
      {concept && (
        <div className="flex justify-between text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">
          <span>{concept.left}</span>
          <span>{concept.right}</span>
        </div>
      )}
    </div>
  );
}
