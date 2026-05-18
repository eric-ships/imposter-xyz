"use client";

// Crew room body. Rendered inside the existing room page chrome
// (header + you-pill + fixed top-right toggles all stay shared).
// Reads view.kind === 'crew' from the parent dispatch.
//
// Crew is a cooperative trick-taking game. Every player holds one
// task: a specific card they must personally win in a trick. The crew
// wins only if every task is completed; a task card won by the wrong
// player loses the mission immediately.
//
// Phases (from view.gameState.phase):
//   play    — tricks played one card at a time in seat order
//   reveal  — mission resolved (won/lost); host starts the next
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import type { PublicRoomView } from "@/lib/game";
import {
  cardId,
  sameCard,
  type CrewCard,
  type CrewPhase,
  type CrewState,
  type CrewTask,
} from "./types";
import { communicationKind, legalCards } from "./state";
import { playRevealStageChime, playTurnChime } from "@/lib/audio";
import type { MatchHistoryEntry } from "@/lib/match-history";
import { avatarFor } from "@/lib/avatar";
import { GameKindSwitcher } from "@/components/GameKindSwitcher";
import { GroupAttributionPill } from "@/components/GroupAttributionPill";
import { SquadPayoffCard } from "@/components/SquadPayoffCard";

// ─── Card visuals ──────────────────────────────────────────────────

// Per-suit colour. Game pieces, not UI chrome, so literal Tailwind
// colours are deliberate here (they shouldn't shift with the theme).
const SUIT_STYLE: Record<
  CrewCard["suit"],
  { bg: string; ring: string; text: string; label: string }
> = {
  blue: { bg: "bg-sky-500", ring: "ring-sky-700", text: "text-white", label: "Blue" },
  green: { bg: "bg-emerald-500", ring: "ring-emerald-700", text: "text-white", label: "Green" },
  pink: { bg: "bg-pink-500", ring: "ring-pink-700", text: "text-white", label: "Pink" },
  yellow: { bg: "bg-amber-500", ring: "ring-amber-700", text: "text-white", label: "Yellow" },
  rocket: { bg: "bg-neutral-900", ring: "ring-neutral-600", text: "text-white", label: "Rocket" },
};

function CardChip({
  card,
  size = "md",
  dimmed = false,
  selected = false,
  onClick,
}: {
  card: CrewCard;
  size?: "sm" | "md" | "lg";
  dimmed?: boolean;
  selected?: boolean;
  onClick?: () => void;
}) {
  const s = SUIT_STYLE[card.suit];
  const dims =
    size === "lg"
      ? "h-20 w-14 text-2xl"
      : size === "sm"
        ? "h-10 w-7 text-sm"
        : "h-16 w-11 text-xl";
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      disabled={onClick ? dimmed : undefined}
      className={`relative flex flex-col items-center justify-center rounded-md font-medium tabular-nums ring-1 ${s.bg} ${s.text} ${s.ring} ${dims} ${
        dimmed ? "opacity-30" : ""
      } ${selected ? "-translate-y-2 ring-2 ring-offset-2 ring-offset-page" : ""} ${
        onClick && !dimmed
          ? "cursor-pointer transition-transform hover:-translate-y-1 active:scale-95"
          : ""
      }`}
    >
      <span>{card.suit === "rocket" ? "🚀" : ""}</span>
      <span>{card.rank}</span>
    </Tag>
  );
}

// ─── Entry ─────────────────────────────────────────────────────────

function useCrewAudio(state: CrewState | undefined, playerId: string) {
  const prevPhase = useRef<CrewPhase | null>(null);
  const prevTurn = useRef<string | null>(null);
  const first = useRef(true);
  useEffect(() => {
    if (!state) return;
    const wasFirst = first.current;
    first.current = false;

    if (prevTurn.current !== state.turnId) {
      const wasYour = prevTurn.current === playerId;
      prevTurn.current = state.turnId;
      if (!wasFirst && state.turnId === playerId && !wasYour) {
        playTurnChime();
      }
    }
    if (prevPhase.current !== state.phase) {
      const prev = prevPhase.current;
      prevPhase.current = state.phase;
      if (!wasFirst && state.phase === "reveal" && prev !== "reveal") {
        playRevealStageChime(state.outcome === "won" ? 2 : 0);
      }
    }
  }, [state, playerId]);
}

export function CrewBody({
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
  useCrewAudio(
    view.gameState as unknown as CrewState | undefined,
    playerId
  );

  if (view.state === "lobby") {
    return (
      <CrewLobby
        view={view}
        playerId={playerId}
        code={code}
        isHost={isHost}
        userId={userId}
      />
    );
  }

  const state = view.gameState as unknown as CrewState | undefined;
  if (!state || !state.phase) {
    return (
      <p className="text-center text-sm text-ink-soft">Loading mission…</p>
    );
  }

  return (
    <CrewMatch
      view={view}
      playerId={playerId}
      code={code}
      isHost={isHost}
      state={state}
    />
  );
}

// ─── Lobby ─────────────────────────────────────────────────────────

function CrewLobby({
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
  const count = view.players.length;
  const canStart = count >= 3 && count <= 5;

  async function start() {
    setError(null);
    setStarting(true);
    try {
      const res = await fetch(`/api/rooms/${code}/crew/start`, {
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
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">
          Crew · {count} aboard {count > 5 && "(needs 3-5)"}
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
                      : "text-sm font-medium text-white"
                  }`}
                >
                  {av.initial}
                </div>
                <span className="text-sm text-ink">
                  {p.nickname}
                  {p.id === view.hostId && (
                    <span className="ml-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-accent">
                      Host
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-3 rounded-xl border border-line-soft bg-surface/40 p-4">
        <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">
          How Crew works
        </h3>
        <p className="text-sm text-ink-soft">
          A cooperative trick-taking mission. Everyone is dealt a hand
          and one <em>task</em> — a specific card you personally must
          win in a trick. Follow the led colour if you can; rockets
          beat everything. The crew wins only if{" "}
          <span className="text-leaf">every task is completed</span> —
          but if a task card is won by the{" "}
          <span className="text-oxblood">wrong crewmate</span>, the
          mission fails. Talking is allowed; each player also has one{" "}
          <em>signal</em> to reveal a card.
        </p>
      </section>

      {isHost ? (
        <button
          onClick={start}
          disabled={!canStart || starting}
          className="w-full rounded-2xl bg-accent px-6 py-4 text-base font-semibold tracking-tight text-white shadow-sm transition-all duration-100 hover:brightness-110 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-30"
        >
          {starting
            ? "Launching…"
            : count < 3
              ? `Awaiting ${3 - count} more`
              : count > 5
                ? "Too many — Crew is 3-5"
                : "Launch the mission"}
        </button>
      ) : (
        <p className="text-center text-[11px] uppercase tracking-[0.2em] text-ink-faint">
          Awaiting the host
        </p>
      )}

      {error && (
        <p className="border-l border-oxblood bg-oxblood/5 px-4 py-2 text-sm text-oxblood">
          {error}
        </p>
      )}

      <CrewHistoryPanel history={view.matchHistory ?? []} />
    </div>
  );
}

// ─── Match ─────────────────────────────────────────────────────────

function CrewMatch({
  view,
  playerId,
  code,
  isHost,
  state,
}: {
  view: PublicRoomView;
  playerId: string;
  code: string;
  isHost: boolean;
  state: CrewState;
}) {
  useDeadlineExpire(state.deadline, code);

  const nameById = new Map(view.players.map((p) => [p.id, p.nickname]));

  if (state.phase === "reveal") {
    return (
      <CrewReveal
        view={view}
        playerId={playerId}
        code={code}
        isHost={isHost}
        state={state}
        nameById={nameById}
      />
    );
  }

  return (
    <CrewPlay
      view={view}
      playerId={playerId}
      code={code}
      state={state}
      nameById={nameById}
    />
  );
}

// ─── Play phase ────────────────────────────────────────────────────

function CrewPlay({
  view,
  playerId,
  code,
  state,
  nameById,
}: {
  view: PublicRoomView;
  playerId: string;
  code: string;
  state: CrewState;
  nameById: Map<string, string>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signalMode, setSignalMode] = useState(false);

  const myHand = state.hands[playerId] ?? [];
  const yourTurn = state.turnId === playerId;
  const legal = legalCards(myHand, state.currentTrick);
  const legalIds = new Set(legal.map(cardId));
  const myComm = state.communications[playerId] ?? null;
  const ledSuit = state.currentTrick[0]?.card.suit ?? null;

  async function post(path: string, body: unknown) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/rooms/${code}/crew/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  function playCard(card: CrewCard) {
    if (busy || !yourTurn || !legalIds.has(cardId(card))) return;
    void post("play", { playerId, card });
  }

  function signalCard(card: CrewCard) {
    if (busy) return;
    setSignalMode(false);
    void post("communicate", { playerId, card });
  }

  return (
    <div className="space-y-6">
      {/* Trick header + countdown */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">
            Trick {state.trickNumber + 1} of {state.totalTricks}
          </span>
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">
            Turn ·{" "}
            <span className={yourTurn ? "text-accent" : "text-ink"}>
              {yourTurn ? "you" : (nameById.get(state.turnId) ?? "?")}
            </span>
          </span>
        </div>
        <CountdownPill deadline={state.deadline} />
      </div>

      {/* Tasks */}
      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">
          Tasks · {state.tasks.filter((t) => t.done).length} of{" "}
          {state.tasks.length} done
        </h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {state.tasks.map((task) => (
            <TaskPill
              key={cardId(task.card)}
              task={task}
              nameById={nameById}
              players={view.players}
              isYou={task.ownerId === playerId}
            />
          ))}
        </div>
      </section>

      {/* Current trick */}
      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">
          On the table
          {ledSuit && (
            <>
              {" "}
              · led{" "}
              <span className="text-ink">{SUIT_STYLE[ledSuit].label}</span>
            </>
          )}
        </h3>
        <div className="flex min-h-[5.5rem] flex-wrap items-end gap-3 rounded-xl border border-line-soft bg-surface/30 p-3">
          {state.currentTrick.length === 0 && (
            <span className="text-sm text-ink-faint">
              {nameById.get(state.leaderId) ?? "?"} leads the trick…
            </span>
          )}
          {state.currentTrick.map((play) => (
            <div
              key={play.playerId}
              className="flex flex-col items-center gap-1"
            >
              <CardChip card={play.card} />
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                {play.playerId === playerId
                  ? "you"
                  : (nameById.get(play.playerId) ?? "?")}
              </span>
            </div>
          ))}
        </div>
        {state.lastTrick && state.currentTrick.length === 0 && (
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
            Last trick won by{" "}
            <span className="text-ink">
              {state.lastTrick.winnerId === playerId
                ? "you"
                : (nameById.get(state.lastTrick.winnerId) ?? "?")}
            </span>
          </p>
        )}
      </section>

      {/* Communications */}
      <CommunicationStrip
        state={state}
        playerId={playerId}
        nameById={nameById}
      />

      {/* Your hand */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">
            Your hand
          </h3>
          {!myComm && (
            <button
              onClick={() => setSignalMode((v) => !v)}
              className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent transition hover:text-ink"
            >
              {signalMode ? "Cancel" : "Signal a card"}
            </button>
          )}
        </div>

        {signalMode ? (
          <CommunicationPicker
            hand={myHand}
            onPick={signalCard}
          />
        ) : (
          <div className="flex flex-wrap gap-2">
            {myHand.length === 0 && (
              <span className="text-sm text-ink-faint">
                Out of cards.
              </span>
            )}
            {myHand.map((card) => {
              const playable = yourTurn && legalIds.has(cardId(card));
              return (
                <CardChip
                  key={cardId(card)}
                  card={card}
                  size="lg"
                  dimmed={yourTurn && !playable}
                  onClick={
                    yourTurn ? () => playCard(card) : undefined
                  }
                />
              );
            })}
          </div>
        )}

        <p className="text-[11px] text-ink-faint">
          {yourTurn
            ? state.currentTrick.length === 0
              ? "You lead — play any card."
              : "Follow the led colour if you can."
            : `Waiting on ${nameById.get(state.turnId) ?? "the next player"}…`}
        </p>
      </section>

      {error && (
        <p className="border-l border-oxblood bg-oxblood/5 px-4 py-2 text-sm text-oxblood">
          {error}
        </p>
      )}
    </div>
  );
}

function TaskPill({
  task,
  nameById,
  players,
  isYou,
}: {
  task: CrewTask;
  nameById: Map<string, string>;
  players: PublicRoomView["players"];
  isYou: boolean;
}) {
  const av = avatarFor(
    task.ownerId,
    nameById.get(task.ownerId) ?? "?",
    players.find((p) => p.id === task.ownerId)?.avatar ?? null,
    players
  );
  const status = task.failed
    ? "border-oxblood/50 bg-oxblood/5"
    : task.done
      ? "border-leaf/50 bg-leaf/5"
      : isYou
        ? "border-accent/50 bg-accent/5"
        : "border-line-soft bg-surface/30";
  return (
    <div
      className={`flex items-center gap-2 rounded-xl border p-2 ${status}`}
    >
      <CardChip card={task.card} size="sm" />
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-xs text-ink">
          {isYou ? "You" : (nameById.get(task.ownerId) ?? "?")}
        </span>
        <span
          className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${
            task.failed
              ? "text-oxblood"
              : task.done
                ? "text-leaf"
                : "text-ink-faint"
          }`}
        >
          {task.failed ? "Failed" : task.done ? "Done" : "Open"}
        </span>
      </div>
      <span className="ml-auto text-[10px] text-ink-faint">
        {av.initial}
      </span>
    </div>
  );
}

function CommunicationStrip({
  state,
  playerId,
  nameById,
}: {
  state: CrewState;
  playerId: string;
  nameById: Map<string, string>;
}) {
  const signals = state.order
    .map((pid) => ({ pid, comm: state.communications[pid] }))
    .filter((s) => s.comm);
  if (signals.length === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">
        Signals
      </h3>
      <div className="flex flex-wrap gap-3">
        {signals.map(({ pid, comm }) => (
          <div
            key={pid}
            className="flex items-center gap-2 rounded-xl border border-line-soft bg-surface/30 px-2 py-1.5"
          >
            <CardChip card={comm!.card} size="sm" />
            <div className="flex flex-col">
              <span className="text-xs text-ink">
                {pid === playerId ? "You" : (nameById.get(pid) ?? "?")}
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                {comm!.kind} of {SUIT_STYLE[comm!.card.suit].label}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CommunicationPicker({
  hand,
  onPick,
}: {
  hand: CrewCard[];
  onPick: (card: CrewCard) => void;
}) {
  const choices = hand.filter((c) => communicationKind(hand, c) !== null);
  if (choices.length === 0) {
    return (
      <p className="rounded-xl border border-line-soft bg-surface/30 px-3 py-2 text-sm text-ink-faint">
        No card you hold is signalable — you can only reveal the
        highest, lowest, or only card of a colour.
      </p>
    );
  }
  return (
    <div className="space-y-2 rounded-xl border border-accent/30 bg-accent/5 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
        Reveal your highest / lowest / only of a colour
      </p>
      <div className="flex flex-wrap gap-2">
        {choices.map((card) => {
          const kind = communicationKind(hand, card)!;
          return (
            <div
              key={cardId(card)}
              className="flex flex-col items-center gap-1"
            >
              <CardChip card={card} onClick={() => onPick(card)} />
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                {kind}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Reveal phase ──────────────────────────────────────────────────

function CrewReveal({
  view,
  playerId,
  code,
  isHost,
  state,
  nameById,
}: {
  view: PublicRoomView;
  playerId: string;
  code: string;
  isHost: boolean;
  state: CrewState;
  nameById: Map<string, string>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const won = state.outcome === "won";

  async function nextMission() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/rooms/${code}/crew/next-mission`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className={`rounded-xl border p-6 text-center ${
          won
            ? "border-leaf/50 bg-leaf/5"
            : "border-oxblood/50 bg-oxblood/5"
        }`}
      >
        <div
          className={`text-xs font-semibold uppercase tracking-[0.14em] ${
            won ? "text-leaf" : "text-oxblood"
          }`}
        >
          {won ? "Mission accomplished" : "Mission failed"}
        </div>
        <div className="mt-2 font-serif text-4xl text-ink">
          {won ? "The crew prevails" : "Better luck next run"}
        </div>
        {state.resultDetail && (
          <p className="mt-2 text-sm text-ink-soft">
            {state.resultDetail}
          </p>
        )}
      </motion.div>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">
          Task results
        </h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {state.tasks.map((task) => (
            <TaskPill
              key={cardId(task.card)}
              task={task}
              nameById={nameById}
              players={view.players}
              isYou={task.ownerId === playerId}
            />
          ))}
        </div>
      </section>

      {view.you?.squadStanding && (
        <SquadPayoffCard standing={view.you.squadStanding} />
      )}

      {isHost ? (
        <button
          onClick={nextMission}
          disabled={busy}
          className="w-full rounded-2xl bg-accent px-6 py-4 text-base font-semibold tracking-tight text-white shadow-sm transition-all duration-100 hover:brightness-110 active:scale-[0.97] disabled:opacity-40"
        >
          {busy ? "Dealing…" : "New mission"}
        </button>
      ) : (
        <p className="text-center text-[11px] uppercase tracking-[0.2em] text-ink-faint">
          Awaiting the host to deal a new mission
        </p>
      )}

      {error && (
        <p className="border-l border-oxblood bg-oxblood/5 px-4 py-2 text-sm text-oxblood">
          {error}
        </p>
      )}

      <CrewHistoryPanel history={view.matchHistory ?? []} />
    </div>
  );
}

// ─── History ───────────────────────────────────────────────────────

function CrewHistoryPanel({ history }: { history: MatchHistoryEntry[] }) {
  if (history.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">
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
          if (!("kind" in m) || m.kind !== "crew") {
            return (
              <div
                key={`x${m.matchNumber}`}
                className="rounded-xl border border-line-soft bg-page/40 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint"
              >
                Match {m.matchNumber} · {"kind" in m ? m.kind : "imposter"}
                {endedTime && <> · {endedTime}</>}
              </div>
            );
          }
          const won = m.outcome === "won";
          const tasksDone = m.perPlayer.filter((p) => p.taskDone).length;
          return (
            <div
              key={`c${m.matchNumber}`}
              className="rounded-xl border border-line-soft bg-page/40 px-3 py-2.5"
            >
              <div className="flex items-baseline justify-between gap-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                  Match {m.matchNumber} · Crew
                  {endedTime && <> · {endedTime}</>}
                </div>
                <div
                  className={`text-[11px] font-semibold uppercase tracking-[0.12em] ${
                    won ? "text-leaf" : "text-oxblood"
                  }`}
                >
                  {won ? "Won" : "Lost"}
                </div>
              </div>
              <div className="mt-1 text-sm text-ink-soft">
                {tasksDone} of {m.taskCount} tasks completed
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ─── Shared timer helpers (mirror just-one / wavelength) ───────────

function useDeadlineExpire(deadline: string | null, code: string) {
  const firedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!deadline) return;
    if (firedFor.current === deadline) return;
    const ms = new Date(deadline).getTime() - Date.now();
    const fire = () => {
      firedFor.current = deadline;
      fetch(`/api/rooms/${code}/crew/expire`, { method: "POST" }).catch(
        () => {}
      );
    };
    if (ms <= 0) {
      fire();
      return;
    }
    const timer = setTimeout(fire, ms + 250);
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
      className={`text-4xl font-medium leading-none tabular-nums ${
        urgent ? "text-oxblood" : "text-ink"
      }`}
    >
      {mins}:{secs.toString().padStart(2, "0")}
    </motion.span>
  );
}
