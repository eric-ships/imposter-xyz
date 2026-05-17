"use client";

// Just One room body. Rendered inside the existing room page chrome
// (header + you-pill + fixed top-right toggles all stay imposter-side).
// Reads view.kind === 'just-one' from the parent dispatch.
//
// Phases (from view.gameState.phase):
//   lobby   — pre-start, host can begin if ≥3 players
//   clue    — non-guessers privately type a one-word clue; guesser
//              waits with a "X writing clues for you" progress strip
//   guess   — guesser sees surviving (non-duplicate) clues anonymized,
//              types one guess (or skips)
//   reveal  — secret + every clue with elimination status + outcome;
//              host advances to next card
//   final   — total scoreboard, host plays again
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { PublicRoomView } from "@/lib/game";
import {
  type JustOnePhase,
  type JustOneState,
  computeEliminations,
  normalizeClue,
} from "./types";
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

// Per-viewer audio cues. Same shape as wavelength's hook.
function useJustOneAudio(
  state: JustOneState | undefined,
  playerId: string
) {
  const prevPhase = useRef<JustOnePhase | null>(null);
  const prevClueCount = useRef(0);
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (!state) return;
    const wasFirst = isFirstRender.current;
    isFirstRender.current = false;
    const isGuesser = state.guesserId === playerId;

    if (prevPhase.current !== state.phase) {
      const prev = prevPhase.current;
      prevPhase.current = state.phase;
      if (!wasFirst) {
        if (state.phase === "clue" && prev !== "clue") {
          if (!isGuesser) playTurnChime();
        } else if (state.phase === "guess" && prev !== "guess") {
          if (isGuesser) playTurnChime();
        } else if (state.phase === "reveal" && prev !== "reveal") {
          if (state.outcome === "correct") {
            playRevealStageChime(1);
          } else {
            playRevealStageChime(0);
          }
        } else if (state.phase === "final" && prev !== "final") {
          playRevealStageChime(2);
        }
      }
    }

    // Clue lock-in cue for the guesser only (non-guessers don't see
    // others' clues, so the cue would be confusing without the
    // visible progress).
    if (state.phase === "clue") {
      if (
        state.clues.length > prevClueCount.current &&
        !wasFirst &&
        playerId === state.guesserId
      ) {
        playVoteCast();
      }
      prevClueCount.current = state.clues.length;
    } else {
      prevClueCount.current = 0;
    }
  }, [state, playerId]);
}

export function JustOneBody({
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

  useJustOneAudio(
    view.gameState as unknown as JustOneState | undefined,
    playerId
  );

  if (view.state === "lobby") {
    return (
      <JustOneLobby
        view={view}
        playerId={playerId}
        code={code}
        isHost={isHost}
        userId={userId}
      />
    );
  }

  const state = view.gameState as unknown as JustOneState | undefined;
  if (!state || !state.phase) {
    return (
      <p className="text-center text-sm text-ink-soft">Loading match…</p>
    );
  }

  return (
    <JustOneMatch
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

function JustOneLobby({
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
      const res = await fetch(`/api/rooms/${code}/just-one/start`, {
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
        <h2 className="text-[11px] uppercase tracking-[0.22em] text-ink-faint">
          Players · {view.players.length} of 7
        </h2>
        <ul className="divide-y divide-line-soft border-y border-line-soft">
          {view.players.map((p) => {
            const av = avatarFor(p.id, p.nickname, p.avatar, view.players);
            return (
              <li key={p.id} className="flex items-center gap-3 py-3">
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${av.color} ${
                    av.isCustom
                      ? "border border-line text-base"
                      : "text-sm font-semibold text-white"
                  }`}
                >
                  {av.initial}
                </div>
                <span className="text-sm text-ink">
                  {p.nickname}
                  {p.id === view.hostId && (
                    <span className="ml-2 text-[10px] uppercase tracking-[0.18em] text-accent">
                      Host
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-3 rounded-sm border border-line-soft bg-surface/40 p-4">
        <h3 className="text-[11px] uppercase tracking-[0.22em] text-ink-faint">
          How Just One works
        </h3>
        <p className="text-sm text-ink-soft">
          Each round one player is the <em>guesser</em>. Everyone else
          secretly writes a one-word clue for a hidden target. Before
          the guesser sees them, any duplicate clues are{" "}
          <span className="text-oxblood">silently eliminated</span> —
          if you and a teammate wrote the same word, neither of you
          helped. Cooperative scoring out of the deck.
        </p>
      </section>

      {isHost ? (
        <button
          onClick={start}
          disabled={!canStart || starting}
          className="w-full rounded-sm bg-ink px-6 py-4 text-[11px] uppercase tracking-[0.2em] text-page transition-all duration-100 hover:bg-accent active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-30"
        >
          {starting
            ? "Starting…"
            : !canStart
              ? `Awaiting ${3 - view.players.length} more`
              : "Begin the match"}
        </button>
      ) : (
        <p className="text-center text-[11px] uppercase tracking-[0.2em] text-ink-faint">
          Awaiting the host
        </p>
      )}

      {error && (
        <p className="border-l-2 border-oxblood bg-oxblood/5 px-4 py-2 text-sm text-oxblood">
          {error}
        </p>
      )}

      <JustOneHistoryPanel history={view.matchHistory ?? []} />
    </div>
  );
}

// ─── Match (clue / guess / reveal / final) ────────────────────────

function JustOneMatch({
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
  state: JustOneState;
  nicknameById: Map<string, string>;
}) {
  const isGuesser = state.guesserId === playerId;
  const guesserName = state.guesserId
    ? (nicknameById.get(state.guesserId) ?? "?")
    : "?";

  useDeadlineExpire(state.deadline, code);

  if (state.phase === "final") {
    return (
      <JustOneFinal
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
      {/* Card header + countdown. Card label on left, big timer right. */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] uppercase tracking-[0.22em] text-ink-faint">
            Card {state.cardIndex + 1} of {state.totalCards}
          </span>
          <span className="text-[11px] uppercase tracking-[0.22em] text-ink-faint">
            Guesser ·{" "}
            <span className="text-accent">
              {isGuesser ? "you" : guesserName}
            </span>
          </span>
        </div>
        <CountdownPill deadline={state.deadline} />
      </div>

      {/* Phase-specific body */}
      {state.phase === "clue" &&
        (isGuesser ? (
          <GuesserWaitingForClues
            state={state}
            view={view}
            nicknameById={nicknameById}
          />
        ) : (
          <ClueGiverPhase
            state={state}
            view={view}
            code={code}
            playerId={playerId}
          />
        ))}

      {state.phase === "guess" &&
        (isGuesser ? (
          <GuesserPhase
            state={state}
            code={code}
            playerId={playerId}
          />
        ) : (
          <ClueGiverWaitingForGuess
            state={state}
            view={view}
            playerId={playerId}
            guesserName={guesserName}
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

      {/* Score + history strip */}
      <ScoreStrip
        score={state.score}
        played={state.history.length + (state.phase === "reveal" ? 1 : 0)}
        total={state.totalCards}
      />
    </div>
  );
}

function ClueGiverPhase({
  state,
  view,
  code,
  playerId,
}: {
  state: JustOneState;
  view: PublicRoomView;
  code: string;
  playerId: string;
}) {
  const myClue = state.clues.find((c) => c.playerId === playerId);
  const [word, setWord] = useState(myClue?.word ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = !!myClue;
  const others = view.players.filter(
    (p) => p.id !== state.guesserId && p.id !== playerId
  );

  async function submit() {
    const trimmed = word.trim();
    if (trimmed.length === 0) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/rooms/${code}/just-one/clue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, word: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-sm border border-accent/30 bg-accent/5 p-6 text-center">
        <div className="text-[11px] uppercase tracking-[0.22em] text-ink-faint">
          Secret word
        </div>
        <div className="mt-2 font-serif text-3xl text-ink">
          {state.secretWord ?? "?"}
        </div>
      </div>

      <p className="text-center text-sm text-ink-soft">
        Write one word that hints at it.{" "}
        <span className="text-ink-faint">
          Identical clues get eliminated.
        </span>
      </p>

      {locked ? (
        <div className="rounded-sm border border-leaf/40 bg-leaf/5 px-4 py-3 text-center">
          <div className="text-[11px] uppercase tracking-[0.18em] text-leaf">
            Locked in
          </div>
          <div className="mt-1 font-serif text-xl italic text-ink">
            {myClue.word}
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            value={word}
            onChange={(e) => setWord(e.target.value)}
            maxLength={64}
            placeholder="e.g. yellow"
            autoFocus
            type="text"
            name="just-one-clue"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            data-form-type="other"
            data-1p-ignore="true"
            data-lpignore="true"
            className="min-w-0 flex-1 border-b-2 border-accent bg-transparent px-1 pb-2 font-serif text-2xl text-ink outline-none transition placeholder:text-ink-faint/70 focus:border-ink"
            onKeyDown={(e) => {
              if (e.key === "Enter" && word.trim() && !submitting) submit();
            }}
          />
          <button
            onClick={submit}
            disabled={submitting || word.trim().length === 0}
            className="rounded-sm bg-ink px-5 text-[11px] uppercase tracking-[0.2em] text-page transition-all duration-100 hover:bg-accent active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-30"
          >
            {submitting ? "…" : "Submit"}
          </button>
        </div>
      )}

      {/* Tiny progress strip showing who else has submitted (no clue
          contents — those are private until reveal). */}
      <div className="flex flex-wrap gap-2">
        {others.map((p) => {
          const submitted = state.clues.some(
            (c) => c.playerId === p.id
          );
          return (
            <span
              key={p.id}
              className={`rounded-full border px-3 py-1 text-xs ${
                submitted
                  ? "border-leaf bg-leaf/10 text-leaf"
                  : "border-line text-ink-soft"
              }`}
            >
              {p.nickname}
              {submitted && <span className="ml-1.5">✓</span>}
            </span>
          );
        })}
      </div>

      {error && (
        <p className="border-l-2 border-oxblood bg-oxblood/5 px-4 py-2 text-sm text-oxblood">
          {error}
        </p>
      )}
    </div>
  );
}

function GuesserWaitingForClues({
  state,
  view,
  nicknameById,
}: {
  state: JustOneState;
  view: PublicRoomView;
  nicknameById: Map<string, string>;
}) {
  const clueGiverIds = view.players
    .map((p) => p.id)
    .filter((id) => id !== state.guesserId);
  const submittedSet = new Set(state.clues.map((c) => c.playerId));
  return (
    <div className="space-y-5">
      <div className="rounded-sm border border-line-soft bg-surface/40 p-6 text-center">
        <div className="text-[11px] uppercase tracking-[0.22em] text-ink-faint">
          Your turn to guess
        </div>
        <div className="mt-2 font-serif text-2xl text-ink">
          The table is writing clues for you
          <ThinkingDots />
        </div>
      </div>
      <p className="text-center text-sm text-ink-soft">
        Clues so far · {state.clues.length} of {clueGiverIds.length}
      </p>
      <ul className="flex flex-wrap justify-center gap-2">
        {clueGiverIds.map((id) => {
          const submitted = submittedSet.has(id);
          return (
            <li
              key={id}
              className={`rounded-full border px-3 py-1 text-xs ${
                submitted
                  ? "border-leaf bg-leaf/10 text-leaf"
                  : "border-line text-ink-soft"
              }`}
            >
              {nicknameById.get(id) ?? "?"}
              {submitted && <span className="ml-1.5">✓</span>}
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
  state: JustOneState;
  code: string;
  playerId: string;
}) {
  const [guess, setGuess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(skip: boolean) {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/rooms/${code}/just-one/guess`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          skip
            ? { playerId, skip: true }
            : { playerId, guess: guess.trim() }
        ),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
      setSubmitting(false);
    }
  }

  // Server already filtered out eliminations + anonymized authors.
  const surviving = state.clues;

  return (
    <div className="space-y-5">
      <div className="text-center">
        <div className="text-[11px] uppercase tracking-[0.22em] text-ink-faint">
          Surviving clues · {surviving.length}
        </div>
        {surviving.length === 0 ? (
          <p className="mt-3 text-sm italic text-ink-soft">
            All clues were duplicates. You can still guess if you want.
          </p>
        ) : (
          <ul className="mt-3 flex flex-wrap justify-center gap-2">
            {surviving.map((c, i) => (
              <li
                key={i}
                className="rounded-full border border-line bg-page px-4 py-2 font-serif text-lg italic text-ink"
              >
                {c.word}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex gap-2">
        <input
          value={guess}
          onChange={(e) => setGuess(e.target.value)}
          maxLength={64}
          placeholder="Your guess"
          autoFocus
          type="text"
          name="just-one-guess"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          data-form-type="other"
          data-1p-ignore="true"
          data-lpignore="true"
          className="min-w-0 flex-1 border-b-2 border-accent bg-transparent px-1 pb-2 font-serif text-2xl text-ink outline-none transition placeholder:text-ink-faint/70 focus:border-ink"
          onKeyDown={(e) => {
            if (e.key === "Enter" && guess.trim() && !submitting) submit(false);
          }}
        />
        <button
          onClick={() => submit(false)}
          disabled={submitting || guess.trim().length === 0}
          className="rounded-sm bg-ink px-5 text-[11px] uppercase tracking-[0.2em] text-page transition-all duration-100 hover:bg-accent active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-30"
        >
          {submitting ? "…" : "Guess"}
        </button>
      </div>

      <button
        type="button"
        onClick={() => submit(true)}
        disabled={submitting}
        className="w-full text-[11px] uppercase tracking-[0.2em] text-ink-faint transition hover:text-oxblood disabled:opacity-50"
      >
        Skip this card
      </button>

      {error && (
        <p className="border-l-2 border-oxblood bg-oxblood/5 px-4 py-2 text-sm text-oxblood">
          {error}
        </p>
      )}
    </div>
  );
}

function ClueGiverWaitingForGuess({
  state,
  view,
  playerId,
  guesserName,
}: {
  state: JustOneState;
  view: PublicRoomView;
  playerId: string;
  guesserName: string;
}) {
  const myClue = state.clues.find((c) => c.playerId === playerId);
  const eliminated = state.eliminatedPlayerIds.includes(playerId);
  // Survival count for the table to see together: total - eliminated.
  const surviving =
    state.clues.length - state.eliminatedPlayerIds.length;
  const others = view.players.filter(
    (p) => p.id !== state.guesserId && p.id !== playerId
  );
  return (
    <div className="space-y-5">
      <div className="rounded-sm border border-line-soft bg-surface/40 p-6 text-center">
        <div className="text-[11px] uppercase tracking-[0.22em] text-ink-faint">
          Now guessing
        </div>
        <div className="mt-2 font-serif text-2xl text-ink">
          {guesserName} is guessing
          <ThinkingDots />
        </div>
        <div className="mt-3 text-xs text-ink-faint">
          {surviving} of {state.clues.length} clues survived
        </div>
      </div>

      {myClue && (
        <div
          className={`rounded-sm border px-4 py-3 text-center ${
            eliminated
              ? "border-oxblood/40 bg-oxblood/5"
              : "border-leaf/40 bg-leaf/5"
          }`}
        >
          <div
            className={`text-[11px] uppercase tracking-[0.18em] ${
              eliminated ? "text-oxblood" : "text-leaf"
            }`}
          >
            {eliminated ? "Eliminated" : "Surviving"} · your clue
          </div>
          <div className="mt-1 font-serif text-xl italic text-ink">
            {myClue.word}
          </div>
          {eliminated && (
            <div className="mt-1 text-[11px] text-ink-faint">
              Duplicate or matched the secret
            </div>
          )}
        </div>
      )}

      {/* All other clue-givers' status */}
      <ul className="flex flex-wrap justify-center gap-2">
        {others.map((p) => {
          const wrote = state.clues.some((c) => c.playerId === p.id);
          const elim = state.eliminatedPlayerIds.includes(p.id);
          return (
            <li
              key={p.id}
              className={`rounded-full border px-3 py-1 text-xs ${
                !wrote
                  ? "border-line text-ink-faint"
                  : elim
                    ? "border-oxblood/40 bg-oxblood/5 text-oxblood"
                    : "border-leaf/40 bg-leaf/5 text-leaf"
              }`}
            >
              {p.nickname}
              {wrote && <span className="ml-1.5">{elim ? "✗" : "✓"}</span>}
            </li>
          );
        })}
      </ul>
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
  state: JustOneState;
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
        `/api/rooms/${code}/just-one/next-card`,
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

  // Recompute eliminations client-side so the reveal UI doesn't
  // depend on state.eliminatedPlayerIds being present (it's redacted
  // for the guesser during guess phase but reveal exposes everything
  // — still, computing from clues + secret keeps the source-of-truth
  // local to the render).
  const eliminated =
    state.secretWord && state.clues.length
      ? computeEliminations(state.clues, state.secretWord)
      : new Set<string>();

  const isLastCard = state.cardIndex + 1 >= state.totalCards;
  const guessNorm = state.guess
    ? normalizeClue(state.guess)
    : "";
  const secretNorm = state.secretWord
    ? normalizeClue(state.secretWord)
    : "";
  const correct =
    state.outcome === "correct" ||
    (guessNorm.length > 0 && guessNorm === secretNorm);

  return (
    <div className="space-y-5">
      {/* Outcome banner */}
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: -6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 360, damping: 22 }}
        className={`rounded-sm border-2 px-4 py-4 text-center ${
          state.outcome === "correct"
            ? "border-leaf bg-leaf/5"
            : state.outcome === "skipped"
              ? "border-line bg-surface/40"
              : "border-oxblood bg-oxblood/5"
        }`}
      >
        <div
          className={`text-[11px] uppercase tracking-[0.22em] ${
            state.outcome === "correct"
              ? "text-leaf"
              : state.outcome === "skipped"
                ? "text-ink-faint"
                : "text-oxblood"
          }`}
        >
          {state.outcome === "correct"
            ? "Correct"
            : state.outcome === "skipped"
              ? "Skipped"
              : "Wrong"}
        </div>
        <div className="mt-2 font-serif text-3xl text-ink">
          {state.secretWord}
        </div>
        {state.guess && (
          <div className="mt-2 text-sm text-ink-soft">
            Guessed{" "}
            <span
              className={`font-serif italic ${
                correct ? "text-leaf" : "text-oxblood"
              }`}
            >
              {state.guess}
            </span>
          </div>
        )}
      </motion.div>

      {/* All clues with status */}
      {state.clues.length > 0 && (
        <ul className="divide-y divide-line-soft border-y border-line-soft">
          {state.clues.map((c) => {
            const elim = eliminated.has(c.playerId);
            const nickname = nicknameById.get(c.playerId) ?? "?";
            return (
              <li
                key={c.playerId}
                className="flex items-center justify-between gap-3 py-2"
              >
                <span className="text-sm text-ink-soft">{nickname}</span>
                <span className="flex items-baseline gap-3">
                  <span
                    className={`font-serif text-base italic ${
                      elim ? "text-ink-faint line-through" : "text-ink"
                    }`}
                  >
                    {c.word}
                  </span>
                  <span
                    className={`min-w-[5rem] rounded-full px-2 py-0.5 text-center text-[10px] uppercase tracking-[0.18em] ${
                      elim
                        ? "bg-oxblood/10 text-oxblood"
                        : "bg-leaf/10 text-leaf"
                    }`}
                  >
                    {elim ? "Eliminated" : "Survived"}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {isHost ? (
        <button
          onClick={next}
          disabled={advancing}
          className="w-full rounded-sm bg-ink px-6 py-4 text-[11px] uppercase tracking-[0.2em] text-page transition-all duration-100 hover:bg-accent active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-30"
        >
          {advancing
            ? "…"
            : isLastCard
              ? "Show final score"
              : "Next card"}
        </button>
      ) : (
        <p className="text-center text-[11px] uppercase tracking-[0.2em] text-ink-faint">
          {isLastCard
            ? "Awaiting the host for the final score"
            : "Awaiting the host for the next card"}
        </p>
      )}

      {error && (
        <p className="border-l-2 border-oxblood bg-oxblood/5 px-4 py-2 text-sm text-oxblood">
          {error}
        </p>
      )}

      {/* eslint-disable-next-line @typescript-eslint/no-unused-vars */}
      <span className="hidden">{view.players.length}</span>
    </div>
  );
}

function JustOneFinal({
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
  state: JustOneState;
  nicknameById: Map<string, string>;
}) {
  const [restarting, setRestarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const correctCount = state.history.filter(
    (h) => h.outcome === "correct"
  ).length;
  const ratingLabel =
    correctCount >= state.totalCards * 0.85
      ? "Telepathic"
      : correctCount >= state.totalCards * 0.6
        ? "Sharp"
        : correctCount >= state.totalCards * 0.35
          ? "Solid"
          : correctCount >= state.totalCards * 0.15
            ? "Warming up"
            : "Tough deck";

  async function replay() {
    setError(null);
    setRestarting(true);
    try {
      const res = await fetch(
        `/api/rooms/${code}/just-one/next-card`,
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
      <section className="border-2 border-leaf bg-leaf/5 p-8 text-center">
        <div className="text-[11px] uppercase tracking-[0.22em] text-ink-faint">
          Final score
        </div>
        <div className="mt-3 font-serif text-5xl text-leaf">
          {correctCount} / {state.totalCards}
        </div>
        <div className="mt-2 text-sm text-ink-soft">{ratingLabel}</div>
      </section>

      <section>
        <h2 className="mb-3 text-[11px] uppercase tracking-[0.22em] text-ink-faint">
          Card recap
        </h2>
        <ul className="divide-y divide-line-soft border-y border-line-soft">
          {state.history.map((h) => (
            <li
              key={h.cardIndex}
              className="flex items-center justify-between gap-3 py-3"
            >
              <span className="flex items-baseline gap-2">
                <span className="w-5 text-right text-sm text-ink-faint tabular-nums">
                  {h.cardIndex + 1}
                </span>
                <span className="font-serif text-base text-ink">
                  {h.secretWord}
                </span>
              </span>
              <span className="flex items-baseline gap-3">
                <span className="text-[11px] text-ink-soft">
                  {nicknameById.get(h.guesserId) ?? "?"}
                </span>
                <span
                  className={`min-w-[3rem] rounded-full px-2 py-0.5 text-center text-[10px] uppercase tracking-[0.18em] ${
                    h.outcome === "correct"
                      ? "bg-leaf text-white"
                      : h.outcome === "skipped"
                        ? "bg-line text-ink-faint"
                        : "bg-oxblood text-white"
                  }`}
                >
                  {h.outcome === "correct"
                    ? "Got it"
                    : h.outcome === "skipped"
                      ? "Skip"
                      : "Wrong"}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {isHost ? (
        <button
          onClick={replay}
          disabled={restarting}
          className="w-full rounded-sm bg-ink px-6 py-4 text-[11px] uppercase tracking-[0.2em] text-page transition-all duration-100 hover:bg-accent active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-30"
        >
          {restarting ? "…" : "Play again"}
        </button>
      ) : (
        <p className="text-center text-[11px] uppercase tracking-[0.2em] text-ink-faint">
          Awaiting the host
        </p>
      )}

      <ShareMatchButton code={code} kind="just-one" />

      {error && (
        <p className="border-l-2 border-oxblood bg-oxblood/5 px-4 py-2 text-sm text-oxblood">
          {error}
        </p>
      )}

      {/* eslint-disable-next-line @typescript-eslint/no-unused-vars */}
      <span className="hidden">{view.players.length}</span>
    </div>
  );
}

// ─── Bits ──────────────────────────────────────────────────────────

function ScoreStrip({
  score,
  played,
  total,
}: {
  score: number;
  played: number;
  total: number;
}) {
  return (
    <section className="flex items-center justify-between rounded-sm border border-line-soft bg-surface/40 px-4 py-3">
      <span className="text-[11px] uppercase tracking-[0.22em] text-ink-faint">
        Score
      </span>
      <span className="text-base tabular-nums text-ink">
        <span className="font-semibold">{score}</span>{" "}
        <span className="text-ink-faint">
          / {Math.max(played, 1)} played · {total} total
        </span>
      </span>
    </section>
  );
}

function ThinkingDots() {
  return (
    <span className="ml-1 inline-flex gap-0.5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          animate={{ opacity: [0.2, 1, 0.2] }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            delay: i * 0.18,
            ease: "easeInOut",
          }}
        >
          .
        </motion.span>
      ))}
    </span>
  );
}

function useDeadlineExpire(deadline: string | null, code: string) {
  const firedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!deadline) return;
    if (firedFor.current === deadline) return;
    const ms = new Date(deadline).getTime() - Date.now();
    if (ms <= 0) {
      firedFor.current = deadline;
      fetch(`/api/rooms/${code}/just-one/expire`, {
        method: "POST",
      }).catch(() => {});
      return;
    }
    const timer = setTimeout(() => {
      firedFor.current = deadline;
      fetch(`/api/rooms/${code}/just-one/expire`, {
        method: "POST",
      }).catch(() => {});
    }, ms + 250);
    return () => clearTimeout(timer);
  }, [deadline, code]);
}

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
  return (
    <motion.span
      animate={urgent ? { scale: [1, 1.08, 1] } : { scale: 1 }}
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

function JustOneHistoryPanel({
  history,
}: {
  history: MatchHistoryEntry[];
}) {
  if (history.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-[11px] uppercase tracking-[0.22em] text-ink-faint">
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
                className="rounded-sm border border-line-soft bg-page/40 px-3 py-2.5"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-ink-faint">
                    Match {m.matchNumber} · Just One
                    {endedTime && <> · {endedTime}</>}
                  </div>
                  <div className="text-[11px] uppercase tracking-[0.18em] text-leaf">
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
                className="rounded-sm border border-line-soft bg-page/40 px-3 py-2.5"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-ink-faint">
                    Match {m.matchNumber} · Wavelength
                    {endedTime && <> · {endedTime}</>}
                  </div>
                  <div className="text-[11px] uppercase tracking-[0.18em] text-leaf">
                    {m.winnerIds.length === 1 ? "Winner" : "Tied"}
                  </div>
                </div>
                <div className="mt-1 text-sm text-ink">
                  <span className="font-semibold">{winnerNames}</span>
                  <span className="ml-2 text-ink-faint">
                    · {m.topScore} points
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
                className="rounded-sm border border-line-soft bg-page/40 px-3 py-2.5"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-ink-faint">
                    Match {m.matchNumber} · Crew
                    {endedTime && <> · {endedTime}</>}
                  </div>
                  <div
                    className={`text-[11px] uppercase tracking-[0.18em] ${
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
          // Imposter (default)
          return (
            <div
              key={`i${m.matchNumber}`}
              className="rounded-sm border border-line-soft bg-page/40 px-3 py-2.5"
            >
              <div className="flex items-baseline justify-between gap-3">
                <div className="text-[11px] uppercase tracking-[0.2em] text-ink-faint">
                  Match {m.matchNumber} · Imposter
                  {endedTime && <> · {endedTime}</>}
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
