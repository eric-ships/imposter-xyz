"use client";

import {
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { supabase } from "@/lib/supabase/browser";
import type { GuessOutcome, PublicRoomView, RoomState } from "@/lib/game";
import { blockExplorerUrl } from "@/lib/chain";
import {
  DEFAULT_ALLOWANCE,
  DEFAULT_PERIOD_DAYS,
  grantSpendPermissionForPot,
  useBaseAccount,
} from "@/lib/wallet";
import {
  isMuted as audioIsMuted,
  playRevealStageChime,
  playTimerTick,
  playTurnChime,
  primeAudio,
  setMuted as audioSetMuted,
  speakText,
} from "@/lib/audio";
import { TIMER_DURATIONS_MS, TIMER_GRACE_MS } from "@/lib/timer";

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

  // Polling fallback: if Supabase Realtime is misconfigured (e.g. the
  // room_events publication was dropped, or anon RLS blocks replication),
  // players never see each other join because no event ever triggers a
  // refetch. A slow poll ensures the lobby and game state converge
  // regardless. 3s is short enough to feel live, cheap enough to spare.
  useEffect(() => {
    if (!hydrated) return;
    const iv = setInterval(() => refetch(), 3000);
    return () => clearInterval(iv);
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
          Code <span className="font-serif font-semibold tracking-[0.15em]">{code}</span> doesn&apos;t
          exist.
        </p>
        <button
          onClick={() => router.push("/")}
          className="rounded-sm border border-ink px-5 py-2 text-[11px] uppercase tracking-[0.2em] text-ink transition hover:bg-ink hover:text-page"
        >
          Back home
        </button>
      </main>
    );
  }

  if (!view) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md items-center justify-center">
        <p className="text-[11px] uppercase tracking-[0.2em] text-ink-faint">
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
            className="rounded-sm border border-ink px-5 py-2 text-[11px] uppercase tracking-[0.2em] text-ink transition hover:bg-ink hover:text-page"
          >
            Back home
          </button>
        </main>
      );
    }
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-8 px-8">
        <div className="text-center">
          <div className="text-[11px] uppercase tracking-[0.22em] text-ink-faint">
            Join room
          </div>
          <div className="mt-2 font-serif text-4xl tracking-[0.3em] text-ink">
            {code}
          </div>
        </div>
        <label className="block w-full">
          <span className="mb-3 block text-[11px] uppercase tracking-[0.2em] text-ink-faint">
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
          className="w-full rounded-sm bg-ink px-6 py-4 text-[11px] uppercase tracking-[0.2em] text-page transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-30"
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
  useTurnChime(view, playerId);
  useAudioPriming();

  // Casual-mode safety net: if the host enabled "show candidates always"
  // but the eager generation in /start didn't populate the list, kick a
  // fetch so the showcase fills in. The server caches the first
  // generation and broadcasts via realtime, so additional racing
  // requests just return the cached list — safe to fire from every
  // client.
  const candidatesNeedFetch =
    view.showCandidatesAlways &&
    view.guessCandidates.length === 0 &&
    (view.state === "playing" ||
      view.state === "voting" ||
      view.state === "guessing");
  useEffect(() => {
    if (!candidatesNeedFetch) return;
    fetch(`/api/rooms/${code}/candidates?playerId=${playerId}`).catch(() => {
      // Non-fatal: showcase keeps showing the loading state.
    });
  }, [candidatesNeedFetch, code, playerId]);

  const timedState: "playing" | "voting" | "guessing" | null =
    view.state === "playing" ||
    view.state === "voting" ||
    view.state === "guessing"
      ? view.state
      : null;

  // The play/vote/guess phases use a 2-column layout on desktop and want
  // the room. Lobby and reveal stay single-column where a narrower
  // container reads better.
  const widePhase =
    view.state === "playing" ||
    view.state === "voting" ||
    view.state === "guessing";
  const mainWidth = widePhase
    ? "max-w-xl md:max-w-2xl lg:max-w-5xl xl:max-w-6xl"
    : "max-w-xl md:max-w-2xl";

  const currentPlayerId = view.turnOrder[view.turnIndex];
  const currentPlayerName = currentPlayerId
    ? (nicknameById.get(currentPlayerId) ?? null)
    : null;
  const caughtName = view.caughtImposterId
    ? (nicknameById.get(view.caughtImposterId) ?? null)
    : null;
  const timerSubject =
    view.state === "playing"
      ? currentPlayerId === playerId
        ? "Your turn"
        : currentPlayerName
          ? `${currentPlayerName}'s turn`
          : null
      : view.state === "voting"
        ? "Voting"
        : view.state === "guessing"
          ? caughtName
            ? `${caughtName}'s last guess`
            : "Final guess"
          : null;

  // Playing: only the active clue-giver hears the final-10 ticks (others
  // can't act and shouldn't be distracted). Voting and guessing are
  // shared moments — everyone in the room hears the countdown for
  // collective drama.
  const timerTickEnabled =
    view.state === "playing"
      ? currentPlayerId === playerId
      : view.state === "voting" || view.state === "guessing"
        ? true
        : false;

  return (
    <main
      className={`mx-auto grid min-h-screen w-full grid-rows-[auto_1fr_auto] gap-5 px-4 py-4 sm:gap-6 sm:px-6 sm:py-6 lg:gap-7 lg:px-8 lg:py-8 ${mainWidth}`}
    >
      <div className="sticky top-0 z-30 -mx-4 -mt-4 space-y-3 bg-page/95 px-4 pb-3 pt-4 backdrop-blur-sm sm:-mx-6 sm:-mt-6 sm:space-y-4 sm:px-6 sm:pt-6 lg:-mx-8 lg:-mt-8 lg:px-8 lg:pt-8">
      <header className="flex items-center justify-between border-b border-line pb-3 text-[11px] uppercase tracking-[0.22em] text-ink-faint">
        <span className="flex items-baseline gap-2">
          <span>Room</span>
          <span className="font-serif text-base tracking-[0.25em] text-ink normal-case">
            {code}
          </span>
        </span>
        <span className="flex items-center gap-3">
          {you.isHost && (
            <CasualModeButton
              code={code}
              playerId={playerId}
              enabled={view.showCandidatesAlways}
            />
          )}
          <Link
            href="/rules"
            target="_blank"
            rel="noreferrer"
            className="text-[11px] uppercase tracking-[0.2em] text-ink-faint transition hover:text-ink"
            title="How to play"
          >
            Rules
          </Link>
          <MuteToggle />
          <span className="flex items-center gap-2">
            <AvatarPicker
              code={code}
              playerId={playerId}
              nickname={nicknameById.get(playerId) ?? ""}
              avatar={
                view.players.find((p) => p.id === playerId)?.avatar ?? null
              }
            />
            <span className="font-serif text-base text-ink normal-case tracking-normal">
              {nicknameById.get(playerId)}
            </span>
            {you.isHost && (
              <span className="rounded-sm border border-accent/60 px-1.5 py-0.5 text-[10px] tracking-[0.18em] text-accent">
                Host
              </span>
            )}
          </span>
        </span>
      </header>

      {timedState && view.phaseDeadline && (
        <PhaseCountdown
          code={code}
          deadline={view.phaseDeadline}
          state={timedState}
          subject={timerSubject}
          tickEnabled={timerTickEnabled}
        />
      )}
      </div>

      <div className="flex min-h-0 flex-col gap-5 sm:gap-6 lg:gap-7">
        <AnimatePresence mode="wait">
          <motion.div
            key={view.state}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="flex flex-col gap-7"
          >
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

            {view.state === "guessing" && (
              <GuessPhase view={view} playerId={playerId} code={code} />
            )}

            {view.state === "reveal" && (
              <RevealPhase view={view} playerId={playerId} code={code} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {view.showCandidatesAlways &&
        (view.state === "playing" ||
          view.state === "voting" ||
          view.state === "guessing") && (
          <CandidatesShowcase view={view} />
        )}

      {(view.state === "playing" ||
        view.state === "voting" ||
        view.state === "guessing") && (
        <MatchDock view={view} playerId={playerId} />
      )}

      {you.isHost &&
        (view.state === "playing" ||
          view.state === "voting" ||
          view.state === "guessing") && (
          <VoidGameButton code={code} playerId={playerId} />
        )}
    </main>
  );
}

function PhaseCountdown({
  code,
  deadline,
  state,
  subject,
  tickEnabled,
}: {
  code: string;
  deadline: string;
  state: "playing" | "voting" | "guessing";
  subject: string | null;
  // Only chime in the final 10s for players who are actually on the
  // clock (current clue-giver, not-yet-voted, caught imposter). Everyone
  // else watches silently.
  tickEnabled: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  const firedForRef = useRef<string | null>(null);
  const lastTickSecondRef = useRef<number | null>(null);

  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const remaining = new Date(deadline).getTime() - now;
    if (remaining > 0) return;
    if (firedForRef.current === deadline) return;
    firedForRef.current = deadline;
    fetch(`/api/rooms/${code}/expire`, { method: "POST" }).catch(() => {});
  }, [code, deadline, now]);

  // Real ms left until the server-side deadline. The /expire POST is
  // still driven off this — forfeit fires at real 0.
  const realRemainingMs = Math.max(0, new Date(deadline).getTime() - now);
  // What the player sees on the countdown: real minus the silent grace.
  // They watch the number hit 0, and a last-second submission in the
  // grace window still succeeds because the server hasn't expired yet.
  const displayRemainingMs = Math.max(0, realRemainingMs - TIMER_GRACE_MS);
  const totalMs = TIMER_DURATIONS_MS[state];
  const seconds = Math.ceil(displayRemainingMs / 1000);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const display =
    mins > 0 ? `${mins}:${secs.toString().padStart(2, "0")}` : `${secs}`;
  const warn = displayRemainingMs <= 10_000;
  const critical = displayRemainingMs <= 5_000;
  const pct = Math.max(0, Math.min(100, (displayRemainingMs / totalMs) * 100));

  // Reset the tick-tracking ref whenever the deadline changes (new phase,
  // new round) so the next countdown's final 10s gets its own tick series.
  useEffect(() => {
    lastTickSecondRef.current = null;
  }, [deadline]);

  // Tick once per whole second during the final 10. `critical` bumps the
  // pitch on the last 5 to escalate the tension. Only fires for players
  // who are actually on the clock — passive watchers don't hear it.
  useEffect(() => {
    if (!tickEnabled) return;
    if (seconds <= 0 || seconds > 10) return;
    if (lastTickSecondRef.current === seconds) return;
    lastTickSecondRef.current = seconds;
    playTimerTick(critical);
  }, [seconds, critical, tickEnabled]);

  const fallbackLabel =
    state === "playing"
      ? "Clue timer"
      : state === "voting"
        ? "Vote timer"
        : "Guess timer";
  const headline = subject ?? fallbackLabel;

  return (
    <section
      aria-live="polite"
      className="relative overflow-hidden border-y border-line bg-surface/60 px-5 py-3"
    >
      <div className="flex items-baseline justify-center gap-3 text-center">
        <span className="font-serif text-base italic text-ink-soft">
          {headline}
        </span>
        <span className="text-ink-faint">·</span>
        <motion.span
          key={critical ? "crit" : warn ? "warn" : "ok"}
          animate={critical ? { scale: [1, 1.04, 1] } : { scale: 1 }}
          transition={
            critical
              ? { duration: 0.9, repeat: Infinity, ease: "easeInOut" }
              : { duration: 0.18 }
          }
          className={`font-serif text-2xl italic tabular-nums leading-none transition-colors ${
            critical ? "text-oxblood" : warn ? "text-oxblood" : "text-ink"
          }`}
        >
          {display}
          {mins === 0 && <span className="ml-0.5 text-sm">s</span>}
        </motion.span>
      </div>
      <div className="mt-2 h-0.5 overflow-hidden bg-line-soft">
        <div
          className={`h-full transition-[width] duration-[250ms] ease-linear ${
            critical ? "bg-oxblood" : warn ? "bg-oxblood/70" : "bg-accent"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </section>
  );
}

const AVATAR_PRESETS = [
  "🦊",
  "🐻",
  "🐸",
  "🐼",
  "🦉",
  "🐙",
  "🦄",
  "🐝",
  "🐢",
  "🦋",
  "🌵",
  "🍄",
  "🍒",
  "🍕",
  "🌮",
  "👻",
  "💀",
  "🤖",
  "👽",
  "🧙",
  "🧛",
  "🧞",
  "🦹",
  "🥷",
  "🎭",
  "🎨",
  "♟️",
  "🪐",
  "⚡",
  "🔥",
  "🌙",
  "🌈",
];

function AvatarPicker({
  code,
  playerId,
  nickname,
  avatar,
}: {
  code: string;
  playerId: string;
  nickname: string;
  avatar: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [custom, setCustom] = useState("");
  const popRef = useRef<HTMLDivElement | null>(null);
  const { color, initial, isCustom } = avatarFor(playerId, nickname, avatar);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  async function set(next: string | null) {
    if (pending) return;
    setPending(true);
    try {
      await fetch(`/api/rooms/${code}/avatar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, avatar: next }),
      });
      setOpen(false);
      setCustom("");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="relative" ref={popRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Pick your avatar"
        className={`flex h-7 w-7 items-center justify-center rounded-full transition hover:ring-2 hover:ring-accent/50 ${color} ${
          isCustom
            ? "border border-line text-base"
            : "text-xs font-semibold text-white"
        }`}
      >
        {initial}
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-50 w-72 space-y-3 rounded-sm border border-line bg-page p-4 shadow-lg">
          <div className="text-[11px] uppercase tracking-[0.2em] text-ink-faint">
            Pick an avatar
          </div>
          <div className="grid grid-cols-8 gap-1">
            {AVATAR_PRESETS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => set(emoji)}
                disabled={pending}
                className={`flex h-8 w-8 items-center justify-center rounded-sm text-lg transition hover:bg-surface ${
                  avatar === emoji ? "ring-2 ring-accent" : ""
                }`}
              >
                {emoji}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value.slice(0, 2))}
              placeholder="🎯"
              maxLength={2}
              className="w-16 border border-line bg-page px-2 py-1 text-center text-base outline-none focus:border-accent"
            />
            <button
              onClick={() => custom.trim() && set(custom.trim())}
              disabled={pending || !custom.trim()}
              className="flex-1 rounded-sm border border-ink px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-ink transition hover:bg-ink hover:text-page disabled:opacity-40"
            >
              Use custom
            </button>
          </div>
          {avatar && (
            <button
              onClick={() => set(null)}
              disabled={pending}
              className="block w-full text-center text-[11px] uppercase tracking-[0.2em] text-ink-faint hover:text-oxblood"
            >
              Clear (use initial)
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function CasualModeButton({
  code,
  playerId,
  enabled,
}: {
  code: string;
  playerId: string;
  enabled: boolean;
}) {
  const [pending, setPending] = useState(false);

  async function toggle() {
    if (pending) return;
    setPending(true);
    try {
      await fetch(`/api/rooms/${code}/show-candidates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, enabled: !enabled }),
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={pending}
      title={
        enabled
          ? "Shortlist: visible to all"
          : "Shortlist: off (host can enable)"
      }
      className={`rounded-sm border px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] transition disabled:opacity-40 ${
        enabled
          ? "border-accent/60 bg-accent/10 text-accent hover:bg-accent hover:text-page"
          : "border-line text-ink-faint hover:border-ink hover:text-ink"
      }`}
    >
      Shortlist {enabled ? "on" : "off"}
    </button>
  );
}

function MuteToggle() {
  const [muted, setMutedState] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMutedState(audioIsMuted());
    setMounted(true);
  }, []);

  function toggle() {
    primeAudio();
    const next = !muted;
    setMutedState(next);
    audioSetMuted(next);
  }

  // Avoid SSR/client mismatch on the icon: render a stable placeholder
  // until we've read localStorage.
  const iconMuted = mounted ? muted : false;

  return (
    <button
      onClick={toggle}
      aria-label={iconMuted ? "Unmute sounds" : "Mute sounds"}
      title={iconMuted ? "Unmute sounds" : "Mute sounds"}
      className="flex h-6 w-6 items-center justify-center text-ink-faint transition hover:text-ink"
    >
      {iconMuted ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <line x1="23" y1="9" x2="17" y2="15" />
          <line x1="17" y1="9" x2="23" y2="15" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </svg>
      )}
    </button>
  );
}

function useAudioPriming() {
  useEffect(() => {
    // iOS Safari auto-suspends the AudioContext if it sits idle, and
    // resume() only works inside a user-gesture handler. Prime on every
    // pointerdown/touchstart/keydown (not just the first) so a click
    // anywhere during the game keeps audio alive.
    const prime = () => primeAudio();
    document.addEventListener("pointerdown", prime);
    document.addEventListener("touchstart", prime, { passive: true });
    document.addEventListener("keydown", prime);
    // Also re-prime when the tab becomes visible again.
    const onVisible = () => {
      if (document.visibilityState === "visible") primeAudio();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("pointerdown", prime);
      document.removeEventListener("touchstart", prime);
      document.removeEventListener("keydown", prime);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
}

function buzzMobile() {
  if (typeof navigator === "undefined") return;
  // navigator.vibrate is a no-op outside supporting mobile browsers.
  if (typeof navigator.vibrate === "function") {
    navigator.vibrate([80, 60, 80]);
  }
}

function useTurnChime(view: PublicRoomView, playerId: string) {
  const prevCurrentTurnPlayerRef = useRef<string | undefined>(undefined);
  const prevStateRef = useRef<RoomState | undefined>(undefined);

  useEffect(() => {
    const currentPlayerId = view.turnOrder[view.turnIndex];

    if (view.state === "playing") {
      if (
        currentPlayerId === playerId &&
        prevCurrentTurnPlayerRef.current !== playerId
      ) {
        playTurnChime();
        buzzMobile();
      }
      prevCurrentTurnPlayerRef.current = currentPlayerId;
    } else {
      prevCurrentTurnPlayerRef.current = undefined;
    }

    const prevState = prevStateRef.current;
    if (view.state !== prevState) {
      if (view.state === "voting") {
        playTurnChime();
        buzzMobile();
      } else if (view.state === "guessing" && view.you?.isCaughtImposter) {
        playTurnChime();
        buzzMobile();
      }
    }
    prevStateRef.current = view.state;
  }, [
    view.state,
    view.turnIndex,
    view.turnOrder,
    view.you?.isCaughtImposter,
    playerId,
  ]);
}

function VoidGameButton({
  code,
  playerId,
}: {
  code: string;
  playerId: string;
}) {
  const [armed, setArmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  async function voidGame() {
    if (!armed) {
      setArmed(true);
      return;
    }
    setSubmitting(true);
    try {
      await fetch(`/api/rooms/${code}/void`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId }),
      });
    } finally {
      setArmed(false);
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-6 flex justify-center border-t border-line-soft pt-6">
      <button
        onClick={voidGame}
        disabled={submitting}
        className={`text-[11px] uppercase tracking-[0.2em] transition ${
          armed
            ? "text-oxblood hover:opacity-80"
            : "text-ink-faint hover:text-oxblood"
        }`}
      >
        {submitting
          ? "Voiding..."
          : armed
            ? "Tap again to confirm · void game"
            : "Void game"}
      </button>
    </div>
  );
}

function MoleModeBadge({
  view,
  you,
}: {
  view: PublicRoomView;
  you: NonNullable<PublicRoomView["you"]>;
}) {
  if (!view.moleMode && !view.jesusMode) return null;
  const playerById = new Map(view.players.map((p) => [p.id, p]));

  // Jesus mode: only the imposter sees anything (their jesus). Crewmates
  // see nothing (asymmetric info — that's the whole point of the mode).
  if (view.jesusMode) {
    if (!you.isImposter) return null;
    if (!you.partnerId) return null;
    const j = playerById.get(you.partnerId);
    if (!j) return null;
    const av = avatarFor(j.id, j.nickname, j.avatar);
    return (
      <div className="mt-5 inline-flex items-center gap-2 rounded-sm border border-leaf/40 bg-leaf/5 px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-leaf">
        <span>Your jesus:</span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className={`flex h-5 w-5 items-center justify-center rounded-full ${av.color} ${
              av.isCustom
                ? "border border-line text-xs"
                : "text-[10px] font-semibold text-white"
            }`}
          >
            {av.initial}
          </span>
          <span className="font-serif normal-case tracking-normal text-ink">
            {j.nickname}
          </span>
        </span>
      </div>
    );
  }

  // Mole mode — imposter view: list teammates.
  if (you.isImposter) {
    if (you.teammateIds.length === 0) {
      return (
        <div className="mt-5 inline-flex items-center gap-2 rounded-sm border border-oxblood/40 bg-oxblood/5 px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-oxblood">
          You&apos;re flying solo
        </div>
      );
    }
    const teammates = you.teammateIds
      .map((id) => playerById.get(id))
      .filter((p): p is NonNullable<typeof p> => !!p);
    return (
      <div className="mt-5 inline-flex items-center gap-2 rounded-sm border border-oxblood/40 bg-oxblood/5 px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-oxblood">
        <span>Your {teammates.length === 1 ? "partner" : "team"}:</span>
        {teammates.map((p, i) => {
          const av = avatarFor(p.id, p.nickname, p.avatar);
          return (
            <span key={p.id} className="inline-flex items-center gap-1.5">
              {i > 0 && <span className="text-ink-faint">·</span>}
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full ${av.color} ${
                  av.isCustom
                    ? "border border-line text-xs"
                    : "text-[10px] font-semibold text-white"
                }`}
              >
                {av.initial}
              </span>
              <span className="font-serif normal-case tracking-normal text-ink">
                {p.nickname}
              </span>
            </span>
          );
        })}
      </div>
    );
  }

  // Mole mode — crewmate view: show your partner.
  if (you.partnerId) {
    const p = playerById.get(you.partnerId);
    if (!p) return null;
    const av = avatarFor(p.id, p.nickname, p.avatar);
    return (
      <div className="mt-5 inline-flex items-center gap-2 rounded-sm border border-leaf/40 bg-leaf/5 px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-leaf">
        <span>Your partner:</span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className={`flex h-5 w-5 items-center justify-center rounded-full ${av.color} ${
              av.isCustom
                ? "border border-line text-xs"
                : "text-[10px] font-semibold text-white"
            }`}
          >
            {av.initial}
          </span>
          <span className="font-serif normal-case tracking-normal text-ink">
            {p.nickname}
          </span>
        </span>
      </div>
    );
  }

  // Mole mode — crewmate without a partner (lone wolf in odd crew counts).
  return (
    <div className="mt-5 inline-flex items-center gap-2 rounded-sm border border-line px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-ink-soft">
      You have no partner this round
    </div>
  );
}

function SpeakerIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 self-center ${className}`}
      aria-hidden
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] uppercase tracking-[0.22em] text-ink-faint">
      {children}
    </h2>
  );
}

function PlayerList({
  view,
  showScores = true,
  showAnte = false,
  showRank = false,
  deltas,
}: {
  view: PublicRoomView;
  showScores?: boolean;
  showAnte?: boolean;
  showRank?: boolean;
  // Optional per-player score delta to show as a +N / 0 badge next to
  // the score. Used on the reveal screen to highlight what was just
  // earned this round.
  deltas?: Record<string, number>;
}) {
  return (
    <ul className="divide-y divide-line-soft border-y border-line-soft">
      {view.players.map((p, i) => {
        const { color, initial, isCustom } = avatarFor(
          p.id,
          p.nickname,
          p.avatar
        );
        return (
          <li key={p.id} className="flex items-center gap-4 py-3">
            {showRank && (
              <div className="w-4 text-right font-serif text-sm text-ink-faint tabular-nums">
                {i + 1}
              </div>
            )}
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-full ${color} ${
                isCustom
                  ? "border border-line text-base"
                  : "text-sm font-semibold text-white"
              }`}
            >
              {initial}
            </div>
            <div className="flex-1">
              <div className="text-sm text-ink">
                {p.nickname}
                {p.id === view.hostId && (
                  <span className="ml-2 text-[10px] uppercase tracking-[0.18em] text-accent">
                    Host
                  </span>
                )}
              </div>
              {showAnte && (
                <div className="mt-0.5 text-[11px] uppercase tracking-[0.18em] text-ink-faint">
                  {p.antePaid
                    ? "anted"
                    : p.hasPermission
                      ? "authorized"
                      : p.walletAddress
                        ? "wallet · awaiting auth"
                        : "no wallet"}
                </div>
              )}
            </div>
            {showAnte && (
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] ${
                  p.antePaid || p.hasPermission
                    ? "bg-leaf text-white"
                    : p.walletAddress
                      ? "border border-accent text-accent"
                      : "border border-line text-ink-faint"
                }`}
                title={
                  p.antePaid
                    ? "ante paid"
                    : p.hasPermission
                      ? "authorized, will ante on start"
                      : p.walletAddress
                        ? "wallet connected, awaiting authorization"
                        : "no wallet connected"
                }
              >
                {p.antePaid ? "✓" : p.hasPermission ? "✓" : p.walletAddress ? "⋯" : "◯"}
              </div>
            )}
            {showScores && (
              <div className="flex items-baseline gap-2">
                <div className="font-serif text-lg text-ink-soft tabular-nums">
                  {p.score}
                </div>
                {deltas && deltas[p.id] !== undefined && (
                  <motion.span
                    initial={{ opacity: 0, y: -4, scale: 0.8 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{
                      type: "spring",
                      stiffness: 500,
                      damping: 24,
                      delay: 0.1 * i,
                    }}
                    className={`rounded-full px-1.5 text-[10px] font-semibold tabular-nums ${
                      deltas[p.id] > 0
                        ? "bg-leaf/10 text-leaf"
                        : "text-ink-faint/40"
                    }`}
                  >
                    {deltas[p.id] > 0 ? `+${deltas[p.id]}` : "—"}
                  </motion.span>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatUsdc(baseUnits: string | bigint): string {
  const n = typeof baseUnits === "bigint" ? baseUnits : BigInt(baseUnits);
  const whole = n / 1_000_000n;
  const frac = n % 1_000_000n;
  if (frac === 0n) return `${whole}`;
  const fracStr = frac.toString().padStart(6, "0").replace(/0+$/, "");
  return `${whole}.${fracStr}`;
}

function PotPanel({
  view,
  playerId,
  code,
}: {
  view: PublicRoomView;
  playerId: string;
  code: string;
}) {
  const pot = view.pot;
  const isHost = playerId === view.hostId;
  const me = view.players.find((p) => p.id === playerId);
  const { address, isConnecting, connect } = useBaseAccount();

  const [hostToggling, setHostToggling] = useState(false);
  const [granting, setGranting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(enable: boolean) {
    setError(null);
    setHostToggling(true);
    try {
      const res = await fetch(`/api/rooms/${code}/pot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, enabled: enable }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    } finally {
      setHostToggling(false);
    }
  }

  async function doGrantPermission() {
    setError(null);
    setGranting(true);
    try {
      const addr = address ?? (await connect());
      if (!addr) throw new Error("wallet not connected");

      const { permission, signature } = await grantSpendPermissionForPot({
        account: addr,
      });

      const res = await fetch(`/api/rooms/${code}/grant-permission`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId,
          walletAddress: addr,
          permission,
          signature,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "authorize failed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    } finally {
      setGranting(false);
    }
  }

  // Host, pot disabled
  if (!pot) {
    if (!isHost) return null;
    return (
      <section className="space-y-3">
        <SectionLabel>Pot mode</SectionLabel>
        <button
          onClick={() => toggle(true)}
          disabled={hostToggling}
          className="w-full rounded-sm border border-ink px-4 py-3 text-[11px] uppercase tracking-[0.2em] text-ink transition hover:bg-ink hover:text-page disabled:opacity-40"
        >
          {hostToggling ? "Enabling..." : "Enable 1 USDC pot"}
        </button>
        <p className="text-[11px] uppercase tracking-[0.2em] text-ink-faint">
          Base Sepolia · testnet USDC · winner takes the pot
        </p>
        {error && (
          <p className="border-l-2 border-oxblood bg-oxblood/5 px-4 py-2 text-sm text-oxblood">
            {error}
          </p>
        )}
      </section>
    );
  }

  // Pot active
  const totalPot = BigInt(pot.anteAmount) * BigInt(pot.paidCount);
  const playerCount = view.players.length;

  return (
    <section className="space-y-3 border border-accent/30 bg-accent/5 p-5">
      <div className="flex items-baseline justify-between">
        <SectionLabel>Pot</SectionLabel>
        {isHost && pot.paidCount === 0 && (
          <button
            onClick={() => toggle(false)}
            disabled={hostToggling}
            className="text-[11px] uppercase tracking-[0.2em] text-ink-faint hover:text-oxblood"
          >
            disable
          </button>
        )}
      </div>
      <div className="flex items-baseline justify-between">
        <div>
          <div className="font-serif text-3xl text-ink">
            {formatUsdc(totalPot)} USDC
          </div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-ink-faint">
            {pot.paidCount} of {playerCount} anted · {formatUsdc(pot.anteAmount)} each
          </div>
        </div>
        {pot.chainCreateTx && (
          <a
            href={blockExplorerUrl(pot.chainCreateTx)}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] uppercase tracking-[0.2em] text-accent hover:text-ink"
          >
            tx ↗
          </a>
        )}
      </div>

      {me?.antePaid ? (
        <div className="rounded-sm border border-leaf/40 bg-leaf/10 px-4 py-3 text-sm text-leaf">
          ✓ You&apos;ve anted · pot locked until reveal
        </div>
      ) : me?.hasPermission ? (
        <div className="rounded-sm border border-leaf/40 bg-leaf/10 px-4 py-3 text-sm text-leaf">
          ✓ Authorized · host can begin when everyone&apos;s in
          {address && (
            <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-leaf/80">
              {shortAddress(address)} · {formatUsdc(DEFAULT_ALLOWANCE)} USDC
              / {DEFAULT_PERIOD_DAYS} days
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {address && (
            <div className="text-[11px] uppercase tracking-[0.18em] text-ink-faint">
              Wallet: {shortAddress(address)}
            </div>
          )}
          <button
            onClick={doGrantPermission}
            disabled={granting || isConnecting}
            className="w-full rounded-sm bg-ink px-4 py-3 text-[11px] uppercase tracking-[0.2em] text-page transition hover:bg-accent disabled:opacity-40"
          >
            {granting
              ? "Authorizing..."
              : isConnecting
                ? "Connecting..."
                : address
                  ? `Authorize ${formatUsdc(DEFAULT_ALLOWANCE)} USDC`
                  : `Connect & authorize ${formatUsdc(DEFAULT_ALLOWANCE)} USDC`}
          </button>
          <p className="text-[11px] uppercase tracking-[0.18em] text-ink-faint">
            One sign · {formatUsdc(DEFAULT_ALLOWANCE)} USDC /
            {" "}{DEFAULT_PERIOD_DAYS} days · revoke anytime
          </p>
        </div>
      )}

      {error && (
        <p className="border-l-2 border-oxblood bg-oxblood/5 px-4 py-2 text-sm text-oxblood">
          {error}
        </p>
      )}
    </section>
  );
}

function JesusModeToggle({
  view,
  playerId,
  code,
}: {
  view: PublicRoomView;
  playerId: string;
  code: string;
}) {
  const isHost = playerId === view.hostId;
  const enabled = view.jesusMode;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isHost && !enabled) return null;

  async function toggle() {
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/rooms/${code}/jesus-mode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, enabled: !enabled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      className={`space-y-2 border p-4 ${
        enabled ? "border-accent/40 bg-accent/5" : "border-line"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <SectionLabel>Jesus christ mode</SectionLabel>
          <p className="mt-1 text-[11px] text-ink-soft">
            1 imposter who knows one random crewmate (their jesus). The
            crewmate has no idea.
          </p>
          {view.moleMode && enabled && (
            <p className="mt-1 text-[11px] text-oxblood">
              Replaces moley moley mole — they&apos;re mutually exclusive.
            </p>
          )}
        </div>
        {isHost ? (
          <button
            onClick={toggle}
            disabled={pending}
            className={`shrink-0 rounded-sm px-4 py-2 text-[11px] uppercase tracking-[0.2em] transition disabled:opacity-40 ${
              enabled
                ? "bg-accent text-page hover:bg-ink"
                : "border border-ink text-ink hover:bg-ink hover:text-page"
            }`}
          >
            {pending ? "..." : enabled ? "On" : "Off"}
          </button>
        ) : (
          <span className="shrink-0 rounded-sm border border-accent/60 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-accent">
            On
          </span>
        )}
      </div>
      {error && (
        <p className="border-l-2 border-oxblood bg-oxblood/5 px-4 py-2 text-sm text-oxblood">
          {error}
        </p>
      )}
    </section>
  );
}

function MoleModeToggle({
  view,
  playerId,
  code,
}: {
  view: PublicRoomView;
  playerId: string;
  code: string;
}) {
  const isHost = playerId === view.hostId;
  const enabled = view.moleMode;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isHost && !enabled) return null;

  async function toggle() {
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/rooms/${code}/mole-mode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, enabled: !enabled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    } finally {
      setPending(false);
    }
  }

  // Pairing math preview so the host can see what they're signing up for.
  // Mole mode: always 2 imposters (capped at N-1 in the degenerate
  // 3-player case). Crew pairs up; odd crewmate is left unpaired.
  const n = view.players.length;
  const impCount = Math.min(2, Math.max(0, n - 1));
  const crewCount = Math.max(0, n - impCount);
  const pairs = Math.floor(crewCount / 2);
  const lone = crewCount % 2 === 1;

  return (
    <section
      className={`space-y-2 border p-4 ${
        enabled ? "border-accent/40 bg-accent/5" : "border-line"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <SectionLabel>Moley moley mole</SectionLabel>
          <p className="mt-1 text-[11px] text-ink-soft">
            2 imposters know each other. Crewmates pair up — you&apos;ll
            see your partner.
          </p>
          {n >= 3 && (
            <p className="mt-1 text-[11px] text-ink-faint">
              With {n} players: {impCount} imposter{impCount === 1 ? "" : "s"} ·{" "}
              {pairs} crew pair{pairs === 1 ? "" : "s"}
              {lone ? " · 1 lone wolf" : ""}
            </p>
          )}
        </div>
        {isHost ? (
          <button
            onClick={toggle}
            disabled={pending}
            className={`shrink-0 rounded-sm px-4 py-2 text-[11px] uppercase tracking-[0.2em] transition disabled:opacity-40 ${
              enabled
                ? "bg-accent text-page hover:bg-ink"
                : "border border-ink text-ink hover:bg-ink hover:text-page"
            }`}
          >
            {pending ? "..." : enabled ? "On" : "Off"}
          </button>
        ) : (
          <span className="shrink-0 rounded-sm border border-accent/60 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-accent">
            On
          </span>
        )}
      </div>
      {error && (
        <p className="border-l-2 border-oxblood bg-oxblood/5 px-4 py-2 text-sm text-oxblood">
          {error}
        </p>
      )}
    </section>
  );
}

function CandidatesModeToggle({
  view,
  playerId,
  code,
}: {
  view: PublicRoomView;
  playerId: string;
  code: string;
}) {
  const isHost = playerId === view.hostId;
  const enabled = view.showCandidatesAlways;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Non-hosts only see the panel when the mode is on (so they know what
  // they signed up for). Hosts see it always so they can flip the toggle.
  if (!isHost && !enabled) return null;

  async function toggle() {
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/rooms/${code}/show-candidates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, enabled: !enabled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      className={`space-y-2 border p-4 ${
        enabled ? "border-accent/40 bg-accent/5" : "border-line"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <SectionLabel>Shortlist</SectionLabel>
          <p className="mt-1 text-[11px] text-ink-soft">
            Show the guess shortlist to everyone the whole match.
          </p>
        </div>
        {isHost ? (
          <button
            onClick={toggle}
            disabled={pending}
            className={`shrink-0 rounded-sm px-4 py-2 text-[11px] uppercase tracking-[0.2em] transition disabled:opacity-40 ${
              enabled
                ? "bg-accent text-page hover:bg-ink"
                : "border border-ink text-ink hover:bg-ink hover:text-page"
            }`}
          >
            {pending ? "..." : enabled ? "On" : "Off"}
          </button>
        ) : (
          <span className="shrink-0 rounded-sm border border-accent/60 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-accent">
            On
          </span>
        )}
      </div>
      {error && (
        <p className="border-l-2 border-oxblood bg-oxblood/5 px-4 py-2 text-sm text-oxblood">
          {error}
        </p>
      )}
    </section>
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
  // Leaderboard ordering. Once any score is non-zero, winners bubble up;
  // when everyone's at 0 the sort is stable so joined-order is preserved.
  const rankedPlayers = [...view.players].sort((a, b) => b.score - a.score);

  // Pre-warm the Claude word the moment the lobby is ready, so clicking
  // "Begin" skips the ~1-3s generation latency. Endpoint is idempotent.
  useEffect(() => {
    if (!canStart) return;
    fetch(`/api/rooms/${code}/prewarm`, { method: "POST" }).catch(() => {});
  }, [canStart, code]);

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

  const potEnabled = !!view.pot;
  const authorizedCount = view.players.filter(
    (p) => p.hasPermission || p.antePaid
  ).length;
  const potReady = !potEnabled || authorizedCount === view.players.length;
  const startReady = canStart && potReady;
  const startLabel = starting
    ? "Starting"
    : !canStart
      ? `Awaiting ${3 - view.players.length} more`
      : !potReady
        ? `Awaiting ${view.players.length - authorizedCount} to authorize`
        : "Begin the game";

  return (
    <>
      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <SectionLabel>
            {anyScore
              ? "Match Score"
              : `Players · ${view.players.length} of 8`}
          </SectionLabel>
          {anyScore && (
            <span className="text-[11px] uppercase tracking-[0.2em] text-ink-faint">
              {view.players.length} players
            </span>
          )}
        </div>
        <PlayerList
          view={{ ...view, players: rankedPlayers }}
          showScores={anyScore}
          showAnte={potEnabled}
          showRank={anyScore}
        />
      </section>

      <PotPanel view={view} playerId={playerId} code={code} />

      <CandidatesModeToggle view={view} playerId={playerId} code={code} />

      <MoleModeToggle view={view} playerId={playerId} code={code} />

      <JesusModeToggle view={view} playerId={playerId} code={code} />

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
            className="text-[11px] uppercase tracking-[0.2em] text-accent transition hover:text-ink"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </section>

      {isHost ? (
        <button
          onClick={start}
          disabled={!startReady || starting}
          className="rounded-sm bg-ink px-6 py-4 text-[11px] uppercase tracking-[0.2em] text-page transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-30"
        >
          {startLabel}
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

      <div className="flex items-center justify-center gap-6 border-t border-line-soft pt-6">
        <Link
          href="/rules"
          target="_blank"
          rel="noreferrer"
          className="text-[11px] uppercase tracking-[0.2em] text-ink-faint transition hover:text-ink"
        >
          How to play
        </Link>
        <span className="text-[10px] text-ink-faint/40">·</span>
        <LeaveRoomButton code={code} playerId={playerId} isHost={isHost} />
      </div>
    </>
  );
}

function LeaveRoomButton({
  code,
  playerId,
  isHost,
}: {
  code: string;
  playerId: string;
  isHost: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);

  async function leave() {
    setPending(true);
    try {
      await fetch(`/api/rooms/${code}/leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId }),
      });
      // Clear local identity for this room so a re-visit shows the
      // join screen instead of trying to fetch the (now-deleted) player.
      try {
        localStorage.removeItem(`ci:${code}:playerId`);
        localStorage.removeItem(`ci:${code}:nickname`);
      } catch {
        /* ignore */
      }
      router.push("/");
    } finally {
      setPending(false);
    }
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="text-[11px] uppercase tracking-[0.2em] text-ink-faint transition hover:text-oxblood"
      >
        Leave room
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em]">
      <button
        onClick={leave}
        disabled={pending}
        className="text-oxblood transition hover:opacity-70"
        title={
          isHost
            ? "Host will be transferred to the next player"
            : "Leave the lobby"
        }
      >
        {pending ? "Leaving…" : "Confirm leave"}
      </button>
      <span className="text-ink-faint/40">·</span>
      <button
        onClick={() => setConfirming(false)}
        disabled={pending}
        className="text-ink-faint transition hover:text-ink"
      >
        Cancel
      </button>
    </span>
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
  const [optimisticClue, setOptimisticClue] = useState<{
    playerId: string;
    round: number;
    word: string;
  } | null>(null);

  // Clear the optimistic clue once the server echoes it back in view.clues.
  useEffect(() => {
    if (!optimisticClue) return;
    const landed = view.clues.some(
      (c) =>
        c.player_id === optimisticClue.playerId &&
        c.round === optimisticClue.round &&
        c.word === optimisticClue.word
    );
    if (landed) setOptimisticClue(null);
  }, [view.clues, optimisticClue]);

  const nextTurnIndex =
    view.turnOrder.length > 0
      ? (view.turnIndex + 1) % view.turnOrder.length
      : 0;

  // Merge the optimistic clue into a local view so ClueLog + TurnStrip
  // reflect the pending state immediately. Advance turn_index locally too,
  // so the ring glides to the next player right away.
  // Skip the optimistic entry if the server has already echoed a matching
  // clue (same player + round): prevents a duplicate row and removes the
  // exit/enter flicker when the real clue lands.
  const serverHasMatchingClue =
    !!optimisticClue &&
    view.clues.some(
      (c) =>
        c.player_id === optimisticClue.playerId &&
        c.round === optimisticClue.round
    );
  const displayView: PublicRoomView =
    optimisticClue && !serverHasMatchingClue
      ? {
          ...view,
          clues: [
            ...view.clues,
            {
              id: -Date.now(),
              player_id: optimisticClue.playerId,
              round: optimisticClue.round,
              word: optimisticClue.word,
              reactions: [],
            },
          ],
          turnIndex: nextTurnIndex,
        }
      : view;

  const nicknameById = new Map(view.players.map((p) => [p.id, p.nickname]));
  const playerById = new Map(view.players.map((p) => [p.id, p]));
  const currentPlayerId = view.turnOrder[view.turnIndex];
  const isMyTurn = currentPlayerId === playerId && !optimisticClue;
  const iAmNext =
    !isMyTurn && view.turnOrder[nextTurnIndex] === playerId && !optimisticClue;
  const you = view.you!;
  const waitingFor = optimisticClue
    ? view.turnOrder[nextTurnIndex]
    : currentPlayerId;
  const waitingForPlayer = playerById.get(waitingFor);

  async function submit() {
    const trimmed = word.trim();
    if (!trimmed) return;
    setError(null);
    setSubmitting(true);
    setOptimisticClue({ playerId, round: view.round, word: trimmed });
    setWord("");
    try {
      const res = await fetch(`/api/rooms/${code}/clue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, word: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
      setOptimisticClue(null);
      setWord(trimmed);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <TurnStrip view={displayView} playerId={playerId} />

      <div className="flex flex-col gap-7 lg:grid lg:grid-cols-3 lg:items-start lg:gap-8">
        <div className="flex min-w-0 flex-col gap-7 lg:col-span-1">
        <section className="space-y-1">
          <div className="text-[11px] uppercase tracking-[0.22em] text-ink-faint">
            Category
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-serif text-3xl italic leading-none text-ink">
              {view.category}
            </h2>
            <span className="shrink-0 text-[11px] uppercase tracking-[0.2em] text-ink-faint">
              Round {view.round} / {view.totalRounds}
            </span>
          </div>
        </section>

        <section className="relative border-y-2 border-line bg-surface/70 px-6 py-5 text-center sm:py-10">
          <span className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 bg-page px-3 text-[11px] uppercase tracking-[0.22em]">
            <span className={you.isImposter ? "text-oxblood" : "text-leaf"}>
              {you.isImposter ? "Imposter" : "Your word"}
            </span>
          </span>
          {you.isImposter ? (
            <div className="font-serif text-2xl italic text-ink sm:text-3xl">
              Bluff · Find the word
            </div>
          ) : (
            <div className="font-serif text-4xl font-semibold leading-none tracking-tight text-ink sm:text-5xl">
              {you.secretWord}
            </div>
          )}
          <MoleModeBadge view={view} you={you} />
        </section>

        {isMyTurn ? (
          <motion.div
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="relative border-2 border-accent bg-accent/5 px-6 py-6"
          >
            <motion.span
              aria-hidden
              animate={{ opacity: [1, 0.55, 1] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -top-px left-1/2 -translate-x-1/2 -translate-y-1/2 bg-page px-3 text-[11px] uppercase tracking-[0.25em] text-accent"
            >
              Your turn
            </motion.span>
            <div className="space-y-3 pt-1">
              <p className="text-center text-sm text-ink-soft">
                Give a one-word clue
              </p>
              <div className="flex gap-2">
                <input
                  value={word}
                  onChange={(e) => setWord(e.target.value)}
                  maxLength={24}
                  placeholder="e.g. syrup"
                  autoFocus
                  className="min-w-0 flex-1 border-b-2 border-accent bg-transparent px-1 pb-2 font-serif text-2xl italic text-ink outline-none transition placeholder:text-ink-faint/70 focus:border-ink"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && word.trim() && !submitting) submit();
                  }}
                />
                <button
                  onClick={submit}
                  disabled={submitting || word.trim().length === 0}
                  className="rounded-sm bg-ink px-5 text-[11px] uppercase tracking-[0.2em] text-page transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-30"
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
          </motion.div>
        ) : (
          <ActivePlayerHero
            playerId={waitingFor}
            nickname={waitingForPlayer?.nickname ?? "?"}
            avatar={waitingForPlayer?.avatar ?? null}
            iAmNext={iAmNext}
          />
        )}
        </div>

        <div className="min-w-0 lg:col-span-2">
          <ClueLog view={displayView} code={code} playerId={playerId} />
        </div>
      </div>
    </>
  );
}

// 12 hues evenly walked around the wheel — each one is far enough from
// its neighbors that a 5-player table won't end up with two muddy
// olives next to each other. Saturation/lightness held in a narrow
// band (S 38-55%, L 38-48%) so they all read well with white text on
// the cream page and stay tonally consistent with the oxblood/leaf
// design system. Order is interleaved (warm/cool/warm/cool) so the
// first few hash buckets are maximally distinct.
const AVATAR_PALETTE = [
  "bg-[#b04a4a]", // red
  "bg-[#3d8073]", // teal
  "bg-[#c89344]", // gold
  "bg-[#7a5ca8]", // purple
  "bg-[#4f7a3e]", // forest green
  "bg-[#4a86a8]", // sky blue
  "bg-[#b25c8c]", // magenta / rose
  "bg-[#c97240]", // burnt orange
  "bg-[#8b9333]", // olive
  "bg-[#4d6db0]", // indigo
  "bg-[#87593b]", // brown
  "bg-[#5a6470]", // slate
];

function avatarFor(id: string, nickname: string, custom?: string | null) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  const color = AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
  const fallback = nickname.trim().charAt(0).toUpperCase() || "?";
  const initial = custom?.trim() || fallback;
  // Custom emoji avatars hide the bg color (the emoji renders as its own
  // glyph). Fall back to colored initial when no custom is set.
  const isCustom = !!custom?.trim();
  return { color: isCustom ? "bg-surface" : color, initial, isCustom };
}

function CandidatesShowcase({ view }: { view: PublicRoomView }) {
  const empty = view.guessCandidates.length === 0;
  return (
    <section className="space-y-3 border border-line-soft bg-surface/30 p-5">
      <div className="flex items-baseline justify-between">
        <SectionLabel>Possible answers</SectionLabel>
        <span className="text-[11px] uppercase tracking-[0.2em] text-ink-faint">
          {empty
            ? "Shortlist · loading"
            : `Shortlist · ${view.guessCandidates.length} on the menu`}
        </span>
      </div>
      {empty ? (
        <p className="text-sm italic text-ink-faint">
          Pulling the shortlist from Claude
          <ThinkingDots />
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {view.guessCandidates.map((c) => (
            <span
              key={c}
              className="rounded-full border border-line bg-page px-3 py-1 font-serif text-sm text-ink-soft"
            >
              {c}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function MatchDock({
  view,
  playerId,
}: {
  view: PublicRoomView;
  playerId: string;
}) {
  const showPot = !!view.pot?.enabled;
  return (
    <section className="mt-auto border-t border-line bg-surface/40 px-1 py-5 lg:px-2">
      <div
        className={`grid gap-6 ${
          showPot ? "lg:grid-cols-[2fr_3fr_1fr]" : "lg:grid-cols-[1fr_2fr]"
        }`}
      >
        <Scoreboard view={view} playerId={playerId} />
        <MatchProgress view={view} />
        {showPot && <PotStatus view={view} />}
      </div>
    </section>
  );
}

function Scoreboard({
  view,
  playerId,
}: {
  view: PublicRoomView;
  playerId: string;
}) {
  const sorted = [...view.players].sort((a, b) => b.score - a.score);
  return (
    <div className="space-y-2">
      <div className="text-[11px] uppercase tracking-[0.22em] text-ink-faint">
        Scores
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {sorted.map((p) => {
          const isYou = p.id === playerId;
          return (
            <div key={p.id} className="flex items-baseline gap-1.5">
              <span
                className={`font-serif ${
                  isYou ? "font-semibold text-ink" : "text-ink-soft"
                }`}
              >
                {p.nickname}
              </span>
              <span className="text-sm tabular-nums text-ink-faint">
                {p.score}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MatchProgress({ view }: { view: PublicRoomView }) {
  type Status = "done" | "current" | "upcoming";
  const steps: { key: string; label: string; status: Status }[] = [];

  for (let r = 1; r <= view.totalRounds; r++) {
    let status: Status;
    if (view.state === "lobby") status = "upcoming";
    else if (view.state === "playing") {
      status = r < view.round ? "done" : r === view.round ? "current" : "upcoming";
    } else {
      // voting / guessing / reveal: all clue rounds done
      status = "done";
    }
    steps.push({ key: `r${r}`, label: `Round ${r}`, status });
  }
  steps.push({
    key: "vote",
    label: "Vote",
    status:
      view.state === "voting"
        ? "current"
        : view.state === "guessing" || view.state === "reveal"
          ? "done"
          : "upcoming",
  });
  steps.push({
    key: "guess",
    label: "Guess",
    status:
      view.state === "guessing"
        ? "current"
        : view.state === "reveal" && view.caughtImposterId
          ? "done"
          : "upcoming",
  });
  steps.push({
    key: "reveal",
    label: "Reveal",
    status: view.state === "reveal" ? "current" : "upcoming",
  });

  return (
    <div className="space-y-2">
      <div className="text-[11px] uppercase tracking-[0.22em] text-ink-faint">
        Match progress
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        {steps.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            {i > 0 && (
              <span
                className={`h-px w-3 ${
                  s.status === "upcoming" ? "bg-line" : "bg-accent/60"
                }`}
              />
            )}
            <div
              className={`flex items-center gap-1.5 ${
                s.status === "upcoming" ? "opacity-40" : ""
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  s.status === "current"
                    ? "bg-accent ring-2 ring-accent/30 ring-offset-1 ring-offset-page"
                    : s.status === "done"
                      ? "bg-accent"
                      : "bg-line"
                }`}
              />
              <span
                className={`text-[11px] uppercase tracking-[0.18em] ${
                  s.status === "current" ? "text-accent" : "text-ink-faint"
                }`}
              >
                {s.label}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PotStatus({ view }: { view: PublicRoomView }) {
  if (!view.pot?.enabled) return null;
  const ante = BigInt(view.pot.anteAmount);
  const total = (ante * BigInt(view.pot.paidCount)).toString();
  return (
    <div className="space-y-2">
      <div className="text-[11px] uppercase tracking-[0.22em] text-ink-faint">
        Pot
      </div>
      <div className="font-serif text-xl leading-none text-ink tabular-nums">
        {formatUsdc(total)} USDC
      </div>
      <div className="text-[11px] uppercase tracking-[0.18em] text-ink-faint">
        {view.pot.paidCount} / {view.players.length} anted
      </div>
    </div>
  );
}

function ActivePlayerHero({
  playerId,
  nickname,
  avatar,
  iAmNext,
}: {
  playerId: string;
  nickname: string;
  avatar: string | null;
  iAmNext: boolean;
}) {
  const { color, initial, isCustom } = avatarFor(playerId, nickname, avatar);
  return (
    <div className="relative flex flex-col items-center gap-3 border border-line-soft bg-surface/30 px-6 py-5 sm:gap-5 sm:py-10">
      <div className="relative">
        <motion.span
          aria-hidden
          animate={{ scale: [1, 1.22, 1], opacity: [0.5, 0, 0.5] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -inset-3 rounded-full ring-2 ring-accent sm:-inset-4"
        />
        <motion.span
          aria-hidden
          animate={{ scale: [1, 1.4, 1], opacity: [0.3, 0, 0.3] }}
          transition={{
            duration: 1.8,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 0.4,
          }}
          className="absolute -inset-3 rounded-full ring-1 ring-accent/50 sm:-inset-4"
        />
        <div
          className={`relative flex h-20 w-20 items-center justify-center rounded-full sm:h-32 sm:w-32 ${color} ${
            isCustom
              ? "border border-line text-3xl sm:text-6xl"
              : "text-3xl font-semibold text-white sm:text-5xl"
          }`}
        >
          {initial}
        </div>
      </div>
      <div className="space-y-1 text-center sm:space-y-1.5">
        <div className="font-serif text-2xl italic text-ink sm:text-3xl">{nickname}</div>
        <div className="flex items-baseline justify-center gap-1 text-[11px] uppercase tracking-[0.22em] text-ink-faint">
          <span>is thinking</span>
          <ThinkingDots />
        </div>
        {iAmNext && (
          <div className="pt-2 text-[11px] uppercase tracking-[0.22em] text-accent sm:pt-3">
            You&apos;re up next
          </div>
        )}
      </div>
    </div>
  );
}

function ThinkingDots() {
  return (
    <span className="inline-flex gap-0.5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          animate={{ opacity: [0.2, 1, 0.2] }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.2,
          }}
        >
          .
        </motion.span>
      ))}
    </span>
  );
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
        const { color, initial, isCustom } = avatarFor(
          id,
          p.nickname,
          p.avatar
        );

        return (
          <div
            key={id}
            className="flex min-w-[64px] flex-col items-center gap-2"
          >
            <div className="relative">
              {isCurrent && (
                <motion.span
                  layoutId="turn-ring"
                  className="pointer-events-none absolute -inset-1.5 rounded-full ring-2 ring-accent"
                  transition={{ type: "spring", stiffness: 500, damping: 36 }}
                />
              )}
              <motion.div
                animate={{ opacity: isDone ? 0.3 : 1, scale: isCurrent ? 1.05 : 1 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className={`relative flex h-12 w-12 items-center justify-center rounded-full ${color} ${
                  isCustom
                    ? "border border-line text-2xl"
                    : "text-base font-semibold text-white"
                }`}
              >
                {initial}
              </motion.div>
              {isDone && (
                <motion.span
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 500, damping: 28 }}
                  className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-leaf text-[10px] text-white"
                >
                  ✓
                </motion.span>
              )}
            </div>
            <span
              className={`max-w-[88px] truncate text-xs tracking-normal transition-colors ${
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

const REACTION_EMOJI = ["🚩", "🎯", "😂"] as const;
const REACTION_LABELS: Record<string, string> = {
  "🚩": "sus",
  "🎯": "nailed it",
  "😂": "funny",
};

function ClueReactions({
  clue,
  code,
  playerId,
  canReact,
}: {
  clue: PublicRoomView["clues"][number];
  code: string;
  playerId: string;
  canReact: boolean;
}) {
  // Optimistic toggle so the chip flips instantly; the realtime view
  // refetch backfills the canonical state.
  const [pendingDelta, setPendingDelta] = useState<Record<string, number>>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [pickerOpen]);
  const data = new Map<
    string,
    { count: number; mine: boolean; reactors: string[] }
  >();
  for (const r of clue.reactions) {
    data.set(r.emoji, {
      count: r.count,
      mine: r.mine,
      reactors: r.reactors ?? [],
    });
  }

  function effective(emoji: string) {
    const base = data.get(emoji) ?? {
      count: 0,
      mine: false,
      reactors: [] as string[],
    };
    const delta = pendingDelta[emoji] ?? 0;
    if (delta === 0) return base;
    return {
      count: Math.max(0, base.count + delta),
      mine: !base.mine,
      reactors: base.reactors,
    };
  }

  async function tap(emoji: string) {
    if (!canReact) return;
    const cur = effective(emoji);
    const delta = cur.mine ? -1 : 1;
    setPendingDelta((p) => ({ ...p, [emoji]: delta }));
    setPickerOpen(false);
    try {
      await fetch(`/api/rooms/${code}/clues/${clue.id}/react`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, emoji }),
      });
    } finally {
      setPendingDelta((p) => {
        const next = { ...p };
        delete next[emoji];
        return next;
      });
    }
  }

  // Render order: any emoji with reactions first (preserve REACTION_EMOJI
  // order), then anything in the data we don't know about (legacy emoji).
  const orderedActive = REACTION_EMOJI.filter((e) => effective(e).count > 0);
  const legacyActive = Array.from(data.keys()).filter(
    (e) => !REACTION_EMOJI.includes(e as (typeof REACTION_EMOJI)[number])
  );
  const visible = [...orderedActive, ...legacyActive];

  const hasAnyReactions = visible.some((e) => effective(e).count > 0);

  return (
    <div
      ref={rootRef}
      className="flex shrink-0 items-center gap-1"
    >
      <AnimatePresence initial={false}>
        {visible.map((emoji) => {
          const { count, mine, reactors } = effective(emoji);
          if (count === 0) return null;
          const label = REACTION_LABELS[emoji] ?? "";
          const tooltip = reactors.length
            ? `${reactors.join(", ")}${label ? ` · ${label}` : ""}`
            : label;
          return (
            <motion.button
              key={emoji}
              layout
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{
                type: "spring",
                stiffness: 600,
                damping: 25,
              }}
              onClick={() => tap(emoji)}
              title={tooltip}
              className={`group/rx relative flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-sm transition ${
                mine
                  ? "border-accent bg-accent/15 text-accent hover:bg-accent/25"
                  : "border-line bg-page text-ink hover:border-accent/60"
              }`}
            >
              <span className="text-base leading-none">{emoji}</span>
              <span className="text-xs font-semibold tabular-nums">
                {count}
              </span>
            </motion.button>
          );
        })}
      </AnimatePresence>

      {/* Picker trigger: only shown when reactions are still possible
          (i.e. during the active clue/play phase). Once the round
          progresses past play, existing chips remain visible but no
          one can add new reactions. */}
      {canReact && (
      <div className="relative">
        <button
          onClick={() => setPickerOpen((o) => !o)}
          aria-label="Add reaction"
          className={`flex h-6 w-6 items-center justify-center rounded-full border border-transparent text-xs text-ink-faint transition hover:border-line hover:bg-page hover:text-ink ${
            pickerOpen || hasAnyReactions
              ? "opacity-100"
              : "opacity-30 group-hover/clue:opacity-100"
          }`}
        >
          +
        </button>
        <AnimatePresence>
          {pickerOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 4 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              className="absolute left-1/2 top-9 z-30 flex -translate-x-1/2 items-center gap-1 rounded-full border border-line bg-page p-1 shadow-md"
            >
              {REACTION_EMOJI.map((emoji) => {
                const mine = effective(emoji).mine;
                return (
                  <button
                    key={emoji}
                    onClick={() => tap(emoji)}
                    title={REACTION_LABELS[emoji]}
                    className={`flex h-9 w-9 items-center justify-center rounded-full text-lg transition hover:scale-110 hover:bg-surface ${
                      mine ? "bg-accent/15" : ""
                    }`}
                  >
                    {emoji}
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      )}
    </div>
  );
}

function ClueLog({
  view,
  code,
  playerId,
}: {
  view: PublicRoomView;
  code: string;
  playerId: string;
}) {
  const nicknameById = new Map(view.players.map((p) => [p.id, p.nickname]));
  const avatarById = new Map(view.players.map((p) => [p.id, p.avatar]));
  const rounds: Record<number, typeof view.clues> = {};
  for (const c of view.clues) {
    (rounds[c.round] ??= []).push(c);
  }

  if (view.clues.length === 0) return null;

  const activeRound = view.state === "playing" ? view.round : null;

  const sortedRounds = Object.entries(rounds).sort(
    ([a], [b]) => Number(b) - Number(a)
  );
  // On wide screens, lay rounds out as columns (newest leftmost) so the
  // whole match is on screen at once. Cap at 3 columns since matches are
  // 3 rounds; if you ever bump rounds past 3, this gracefully overflows
  // into the next row.
  const lgCols = Math.min(sortedRounds.length, 3);
  const lgGridClass =
    lgCols === 3
      ? "lg:grid-cols-3"
      : lgCols === 2
        ? "lg:grid-cols-2"
        : "lg:grid-cols-1";

  // On mobile, only the most recent round is auto-expanded; previous
  // rounds collapse into a tap-to-expand summary. On lg+ the grid shows
  // everything at once and these states are visually irrelevant
  // (forceExpanded class below).
  return (
    <section className="space-y-4">
      <SectionLabel>Clues</SectionLabel>
      <div className={`grid grid-cols-1 gap-6 ${lgGridClass}`}>
        {sortedRounds.map(([round, clues], roundIdx) => {
            const roundNum = Number(round);
            const isActive = activeRound === roundNum;
            const isMostRecent = roundIdx === 0;
            return (
              <ClueRoundBlock
                key={round}
                round={round}
                clues={clues}
                isActive={isActive}
                defaultOpen={isMostRecent || isActive}
                nicknameById={nicknameById}
                avatarById={avatarById}
                code={code}
                playerId={playerId}
                viewState={view.state}
              />
            );
          })}
      </div>
    </section>
  );
}

function ClueRoundBlock({
  round,
  clues,
  isActive,
  defaultOpen,
  nicknameById,
  avatarById,
  code,
  playerId,
  viewState,
}: {
  round: string;
  clues: PublicRoomView["clues"];
  isActive: boolean;
  defaultOpen: boolean;
  nicknameById: Map<string, string>;
  avatarById: Map<string, string | null>;
  code: string;
  playerId: string;
  viewState: PublicRoomView["state"];
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`mb-2 flex w-full items-baseline justify-between text-left text-[11px] uppercase tracking-[0.2em] transition lg:cursor-default ${
          isActive ? "text-accent" : "text-ink-faint"
        }`}
      >
        <span className="flex items-baseline gap-2">
          <span>Round {round}</span>
          <span className="text-ink-faint/60 lg:hidden">
            · {clues.length} {clues.length === 1 ? "clue" : "clues"}
          </span>
        </span>
        <span className="flex items-baseline gap-2">
          {isActive && <span>In progress</span>}
          <span className="text-ink-faint/60 lg:hidden">
            {open ? "▾" : "▸"}
          </span>
        </span>
      </button>
      <div
        className={`${open ? "" : "hidden"} lg:block`}
      >
        <ul className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
                  <AnimatePresence initial={false}>
                    {[...clues].reverse().map((c) => {
                      const nickname = nicknameById.get(c.player_id) ?? "";
                      const avatar = avatarById.get(c.player_id) ?? null;
                      const { color, initial, isCustom } = avatarFor(
                        c.player_id,
                        nickname,
                        avatar
                      );
                      // Stable key across optimistic -> real swap: clues are
                      // unique per (player, round). Using this key lets React
                      // reuse the DOM node so the optimistic -> server
                      // transition is invisible, and only the genuine 'new
                      // clue from someone else' case animates in.
                      return (
                        <motion.li
                          key={`${c.player_id}-${c.round}`}
                          layout
                          initial={{ opacity: 0, height: 0, y: -8 }}
                          animate={{ opacity: 1, height: "auto", y: 0 }}
                          exit={{ opacity: 0, height: 0, y: -8 }}
                          transition={{
                            opacity: { duration: 0.22, ease: "easeOut" },
                            height: {
                              duration: 0.28,
                              ease: [0.2, 0.8, 0.2, 1],
                            },
                            y: { duration: 0.22, ease: "easeOut" },
                            layout: {
                              duration: 0.28,
                              ease: [0.2, 0.8, 0.2, 1],
                            },
                          }}
                          className="overflow-hidden"
                        >
                          <div className="group/clue space-y-1 py-2.5">
                            <div className="flex items-center gap-2">
                              <div
                                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${color} ${
                                  isCustom
                                    ? "border border-line text-xs"
                                    : "text-[10px] font-semibold text-white"
                                }`}
                              >
                                {initial}
                              </div>
                              <span
                                className="truncate text-xs tracking-normal text-ink-faint"
                                title={nickname}
                              >
                                {nickname}
                              </span>
                            </div>
                            <div className="flex items-baseline justify-between gap-3">
                              <button
                                type="button"
                                onClick={() => speakText(c.word)}
                                title={`Tap to hear · ${c.word}`}
                                className="group/word inline-flex min-w-0 items-baseline gap-1.5 break-words text-left font-serif text-lg leading-snug text-ink transition hover:text-accent [overflow-wrap:anywhere]"
                              >
                                <span>{c.word}</span>
                                <SpeakerIcon className="opacity-0 transition group-hover/word:opacity-60" />
                              </button>
                              <ClueReactions
                                clue={c}
                                code={code}
                                playerId={playerId}
                                canReact={viewState === "playing"}
                              />
                            </div>
                          </div>
                        </motion.li>
                      );
                    })}
                  </AnimatePresence>
                </ul>
      </div>
    </div>
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
  const [optimisticVoteTarget, setOptimisticVoteTarget] = useState<
    string | null
  >(null);

  const serverVote = view.votes.find((v) => v.voter_id === playerId);

  useEffect(() => {
    if (optimisticVoteTarget && serverVote) {
      setOptimisticVoteTarget(null);
    }
  }, [optimisticVoteTarget, serverVote]);

  const myVote = serverVote ??
    (optimisticVoteTarget
      ? { voter_id: playerId, target_id: optimisticVoteTarget }
      : undefined);
  const alreadyVoted = !!myVote;

  async function submit() {
    if (!target) return;
    setError(null);
    setSubmitting(true);
    setOptimisticVoteTarget(target);
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
      setOptimisticVoteTarget(null);
    } finally {
      setSubmitting(false);
    }
  }

  const mergedVotes = optimisticVoteTarget && !serverVote
    ? [...view.votes, { voter_id: playerId, target_id: optimisticVoteTarget }]
    : view.votes;
  const votesReceived = mergedVotes.length;
  const totalPlayers = view.players.length;
  const you = view.you!;

  return (
    <div className="flex flex-col gap-7 lg:grid lg:grid-cols-3 lg:items-start lg:gap-8">
      <div className="flex min-w-0 flex-col gap-7 lg:col-span-1">
        <section className="flex items-center justify-between border-b border-line pb-3 text-[11px] uppercase tracking-[0.22em] text-ink-faint">
          <span className="font-serif text-sm italic text-ink-soft normal-case tracking-normal">
            {view.category}
          </span>
          {!you.isImposter && you.secretWord && (
            <span>
              Word
              <span className="ml-2 font-serif text-sm text-ink normal-case tracking-normal">
                {you.secretWord}
              </span>
            </span>
          )}
          {you.isImposter && (
            <span className="text-oxblood">You are the imposter</span>
          )}
        </section>

        <section className="space-y-4">
          <div className="text-center">
            <div className="font-serif text-3xl italic text-ink">
              Who is the imposter?
            </div>
            <div className="mt-1 text-[11px] uppercase tracking-[0.2em] text-ink-faint">
              {alreadyVoted
                ? `Vote locked · ${votesReceived} of ${totalPlayers}`
                : `Cast your vote · ${votesReceived} of ${totalPlayers} in`}
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 pb-1">
            {view.players.map((p) => {
              const cast = mergedVotes.some((v) => v.voter_id === p.id);
              return (
                <span
                  key={p.id}
                  title={`${p.nickname} ${cast ? "has voted" : "still deciding"}`}
                  className={`h-2.5 w-2.5 rounded-full transition-colors ${
                    cast ? "bg-accent" : "bg-line ring-1 ring-line"
                  }`}
                />
              );
            })}
          </div>
          <div className="space-y-2">
            {view.players.map((p) => {
              const isYou = p.id === playerId;
              const selected = target === p.id;
              const hasCastVote = mergedVotes.some(
                (v) => v.voter_id === p.id
              );
              const { color, initial, isCustom } = avatarFor(
                p.id,
                p.nickname,
                p.avatar
              );
              const disabled = alreadyVoted || isYou;
              return (
                <button
                  key={p.id}
                  onClick={() => !disabled && setTarget(p.id)}
                  disabled={disabled}
                  title={
                    isYou
                      ? "You can't vote for yourself"
                      : alreadyVoted
                        ? "Vote locked"
                        : `Vote for ${p.nickname}`
                  }
                  className={`group/voterow relative flex w-full items-center gap-4 rounded-md border-2 px-4 py-4 text-left transition active:scale-[0.99] ${
                    selected
                      ? "border-accent bg-accent/10 shadow-[0_0_0_4px_rgba(168,134,77,0.08)]"
                      : disabled
                        ? "cursor-not-allowed border-line-soft bg-line-soft/20 opacity-60"
                        : "border-line bg-page hover:border-ink hover:bg-surface/60 hover:shadow-sm"
                  }`}
                >
                  <div className="relative">
                    <div
                      className={`flex h-11 w-11 items-center justify-center rounded-full ${color} ${
                        isCustom
                          ? "border border-line text-2xl"
                          : "text-base font-semibold text-white"
                      }`}
                    >
                      {initial}
                    </div>
                    {hasCastVote && (
                      <span
                        title="cast their vote"
                        className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-leaf text-[9px] font-bold text-white ring-2 ring-page"
                      >
                        ✓
                      </span>
                    )}
                  </div>
                  <div className="flex flex-1 items-baseline gap-2 font-serif text-xl text-ink">
                    <span>{p.nickname}</span>
                    {isYou && (
                      <span className="font-sans text-[11px] uppercase tracking-[0.2em] text-ink-faint">
                        (you)
                      </span>
                    )}
                    {hasCastVote && !isYou && (
                      <span className="font-sans text-[11px] uppercase tracking-[0.2em] text-leaf">
                        voted
                      </span>
                    )}
                    {!hasCastVote && (
                      <span className="font-sans text-[10px] tracking-normal text-ink-faint">
                        deciding
                        <ThinkingDots />
                      </span>
                    )}
                  </div>
                  {alreadyVoted && myVote.target_id === p.id && (
                    <span className="text-[11px] uppercase tracking-[0.2em] text-accent">
                      Your vote
                    </span>
                  )}
                  {selected && !alreadyVoted && (
                    <span className="text-[11px] uppercase tracking-[0.2em] text-accent">
                      Selected
                    </span>
                  )}
                  {!selected && !disabled && (
                    <span className="text-[11px] uppercase tracking-[0.2em] text-ink-faint opacity-0 transition group-hover/voterow:opacity-100">
                      Tap to vote
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {!alreadyVoted &&
            (target ? (
              <motion.button
                key="lock-in"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  type: "spring",
                  stiffness: 400,
                  damping: 28,
                }}
                onClick={submit}
                disabled={submitting}
                className="w-full rounded-sm bg-ink px-6 py-4 text-[11px] uppercase tracking-[0.2em] text-page transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting
                  ? "Submitting"
                  : `Lock in vote · ${
                      view.players.find((p) => p.id === target)?.nickname ?? ""
                    }`}
              </motion.button>
            ) : (
              <p className="text-center text-[11px] uppercase tracking-[0.2em] text-ink-faint">
                Pick someone above to lock your vote
              </p>
            ))}
          {error && (
            <p className="border-l-2 border-oxblood bg-oxblood/5 px-4 py-2 text-sm text-oxblood">
              {error}
            </p>
          )}
        </section>
      </div>

      <div className="min-w-0 lg:col-span-2">
        <ClueLog view={view} code={code} playerId={playerId} />
      </div>
    </div>
  );
}

function GuessPhase({
  view,
  playerId,
  code,
}: {
  view: PublicRoomView;
  playerId: string;
  code: string;
}) {
  // In guessing phase, "you.isImposter" is still valid.
  const you = view.you!;
  const [guess, setGuess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<string[] | null>(null);
  const [candidatesLoading, setCandidatesLoading] = useState(false);

  // Fetch the pickable list for everyone in the room — the imposter uses
  // it to pick, and the rest of the table watches the same shortlist so
  // the moment feels shared. Cached server-side per round.
  useEffect(() => {
    let cancelled = false;
    setCandidatesLoading(true);
    fetch(`/api/rooms/${code}/candidates?playerId=${playerId}`)
      .then(async (res) => {
        const data = (await res.json()) as { candidates?: string[] };
        if (!cancelled && Array.isArray(data.candidates)) {
          setCandidates(data.candidates);
        }
      })
      .catch(() => {
        // Non-fatal: imposter can still type a free guess; watchers just
        // miss the shortlist.
      })
      .finally(() => {
        if (!cancelled) setCandidatesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [code, playerId]);

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/rooms/${code}/guess`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, guess: guess.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    } finally {
      setSubmitting(false);
    }
  }

  // Only the imposter the crew actually caught gets the guess. In a
  // 2-imposter room the uncaught imposter watches like everyone else.
  if (!you.isCaughtImposter) {
    const caughtNickname = view.caughtImposterId
      ? (view.players.find((p) => p.id === view.caughtImposterId)?.nickname ??
         "them")
      : "the imposter";
    return (
      <div className="flex flex-col gap-7 lg:grid lg:grid-cols-3 lg:items-start lg:gap-8">
        <div className="flex min-w-0 flex-col gap-7 lg:col-span-1">
          <section className="border border-line bg-surface p-8 text-center">
            <div className="text-[11px] uppercase tracking-[0.22em] text-accent">
              Caught
            </div>
            <div className="mt-3 font-serif text-3xl italic text-ink">
              One last chance
            </div>
            <div className="mt-4 text-sm leading-relaxed text-ink-soft">
              {you.isImposter
                ? "Your partner got caught. Their guess decides the round."
                : "The caught imposter gets one guess at the secret word. Exact match: they steal the win. Close: a point for both sides."}
            </div>

            <div className="mt-6 border-t border-line-soft pt-5 text-left">
              <div className="text-[11px] uppercase tracking-[0.2em] text-ink-faint">
                {candidatesLoading ? (
                  "Pulling shortlist"
                ) : candidates ? (
                  <>
                    <span className="font-serif text-sm normal-case tracking-normal text-ink-soft">
                      {caughtNickname}
                    </span>{" "}
                    is choosing from
                  </>
                ) : null}
              </div>
              {candidates && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {candidates.map((c) => (
                    <span
                      key={c}
                      className="rounded-full border border-line bg-page px-3 py-1 font-serif text-sm text-ink-soft"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </section>

          <p className="text-center text-[11px] uppercase tracking-[0.2em] text-ink-faint">
            Awaiting{" "}
            <span className="font-serif text-sm normal-case tracking-normal text-ink-soft">
              {caughtNickname}
            </span>
            &apos;s guess
          </p>
        </div>

        <div className="min-w-0 lg:col-span-2">
          <ClueLog view={view} code={code} playerId={playerId} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-7 lg:grid lg:grid-cols-3 lg:items-start lg:gap-8">
      <div className="flex min-w-0 flex-col gap-7 lg:col-span-1">
        <section className="border-2 border-accent bg-accent/5 p-8 text-center">
          <div className="text-[11px] uppercase tracking-[0.22em] text-accent">
            You were caught
          </div>
          <div className="mt-3 font-serif text-3xl italic text-ink">
            One last chance
          </div>
          <div className="mt-4 text-sm leading-relaxed text-ink-soft">
            Guess the secret word.
            <br />
            Exact match: you win the round.
            <br />
            Close enough: a split point for everyone.
          </div>

          <div className="mt-6 flex gap-2 text-left">
            <input
              value={guess}
              onChange={(e) => setGuess(e.target.value)}
              maxLength={80}
              placeholder="e.g. Medusa"
              autoFocus
              className="min-w-0 flex-1 border-b border-line bg-transparent px-1 pb-2 font-serif text-xl italic text-ink outline-none transition placeholder:text-ink-faint focus:border-accent"
              onKeyDown={(e) => {
                if (e.key === "Enter" && guess.trim() && !submitting) submit();
              }}
            />
            <button
              onClick={submit}
              disabled={submitting || guess.trim().length === 0}
              className="rounded-sm bg-ink px-5 text-[11px] uppercase tracking-[0.2em] text-page transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-30"
            >
              {submitting ? "Judging" : "Submit"}
            </button>
          </div>
          {error && (
            <p className="mt-3 border-l-2 border-oxblood bg-oxblood/5 px-4 py-2 text-left text-sm text-oxblood">
              {error}
            </p>
          )}

          <div className="mt-6 border-t border-line-soft pt-5 text-left">
            <div className="text-[11px] uppercase tracking-[0.2em] text-ink-faint">
              {candidatesLoading
                ? "Pulling candidates"
                : candidates
                  ? "Tap to pick"
                  : null}
            </div>
            {candidates && (
              <div className="mt-3 flex flex-wrap gap-2">
                {candidates.map((c) => {
                  const selected = guess === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setGuess(c)}
                      className={`rounded-full border px-3 py-1 font-serif text-sm transition ${
                        selected
                          ? "border-accent bg-accent text-page"
                          : "border-line bg-page text-ink hover:border-accent hover:text-accent"
                      }`}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="flex items-center justify-between text-[11px] uppercase tracking-[0.22em] text-ink-faint">
          <span>Category</span>
          <span className="font-serif text-sm italic text-ink-soft normal-case tracking-normal">
            {view.category}
          </span>
        </section>
      </div>

      <div className="min-w-0 lg:col-span-2">
        <ClueLog view={view} code={code} playerId={playerId} />
      </div>
    </div>
  );
}

// Outcome flavor text. Each pool is a list of evocative one-liners; we
// pick one deterministically per match so the same secret + outcome
// always yields the same line within a single reveal screen (avoids
// flicker on re-render).
const REVEAL_LINES = {
  imposterEscaped: [
    "You fooled them all.",
    "Bluffed your way to glory.",
    "The table never saw it coming.",
    "You sold the lie.",
    "You walked among them.",
    "Smooth tongue, full pockets.",
    "The mask held.",
  ],
  imposterCaughtExact: [
    "Caught — but you saved the round.",
    "They sniffed you out, but the word was yours.",
    "Last gasp, perfect guess.",
    "Cornered. Then crowned.",
  ],
  imposterCaughtClose: [
    "Close enough — the table splits the point.",
    "Half a glory, half a confession.",
    "Almost. A draw will do.",
  ],
  imposterCaughtWrong: [
    "Caught red-handed.",
    "The bluff died on your tongue.",
    "Outmanned, outguessed.",
    "The crewmates take this one.",
  ],
  crewMissed: [
    "The {imp} slipped past you.",
    "The bluff held.",
    "Snake in the grass — and you missed it.",
    "They walked away clean.",
    "A wolf among the sheep, and you let them go.",
  ],
  crewCaughtExact: [
    "You caught them — but they knew the word.",
    "Smelled the rat. Couldn't stop the answer.",
    "A fair fight. They won the toss.",
  ],
  crewCaughtClose: [
    "Caught, but the guess was nearly right.",
    "Half a victory.",
    "Almost. The point splits.",
  ],
  crewCaughtWrong: [
    "You caught the {imp} clean.",
    "Nose for liars.",
    "Sherlock energy.",
    "You smelled the rat.",
    "Rat caught, word safe.",
  ],
} as const;

function pickRevealLine({
  youAreImposter,
  caught,
  outcome,
  imposterWord,
}: {
  youAreImposter: boolean;
  caught: boolean;
  outcome: GuessOutcome | null;
  imposterWord: string;
}): string {
  const pool = !caught
    ? youAreImposter
      ? REVEAL_LINES.imposterEscaped
      : REVEAL_LINES.crewMissed
    : outcome === "exact"
      ? youAreImposter
        ? REVEAL_LINES.imposterCaughtExact
        : REVEAL_LINES.crewCaughtExact
      : outcome === "close"
        ? youAreImposter
          ? REVEAL_LINES.imposterCaughtClose
          : REVEAL_LINES.crewCaughtClose
        : youAreImposter
          ? REVEAL_LINES.imposterCaughtWrong
          : REVEAL_LINES.crewCaughtWrong;
  const line = pool[Math.floor(Math.random() * pool.length)];
  return line.replace(/\{imp\}/g, imposterWord);
}

function RevealConfetti({ variant }: { variant: "win" | "loss" | "draw" }) {
  // Hand-rolled particle bursts: a primary radial burst from center,
  // then a secondary "rain" wave drifting down from the top half.
  // Win gets 80 burst + 50 rain; draw gets 24 burst only; loss is muted.
  const burst = useMemo(() => {
    if (variant === "loss") return [];
    const count = variant === "win" ? 80 : 24;
    return Array.from({ length: count }, (_, i) => {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.6;
      const distance = 240 + Math.random() * 320;
      return {
        id: i,
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance - 80, // bias upward
        rotate: Math.random() * 720 - 360,
        delay: Math.random() * 0.18,
        size: 6 + Math.random() * 10,
        // Mix of palette: leaf (win) or accent (draw) plus a sprinkle
        // of the alternate to keep it from looking monochrome.
        alt: Math.random() < 0.25,
        // Mix of shapes: most rectangles (confetti strips), some squares.
        square: Math.random() < 0.22,
      };
    });
  }, [variant]);

  const rain = useMemo(() => {
    if (variant !== "win") return [];
    const count = 50;
    return Array.from({ length: count }, (_, i) => {
      // Fan out across the viewport width, start above the screen.
      const xStart = (Math.random() - 0.5) * 1100;
      const drift = (Math.random() - 0.5) * 240;
      return {
        id: i,
        xStart,
        xEnd: xStart + drift,
        rotate: Math.random() * 540 - 270,
        delay: 0.4 + Math.random() * 1.2,
        size: 5 + Math.random() * 9,
        duration: 2.6 + Math.random() * 1.4,
        alt: Math.random() < 0.25,
        square: Math.random() < 0.22,
      };
    });
  }, [variant]);

  // Win celebration sound: a satisfying triad fanfare on top of the
  // existing reveal-stage chime ladder. Fires once on mount.
  useEffect(() => {
    if (variant !== "win") return;
    let cancelled = false;
    const ctx = (() => {
      if (typeof window === "undefined") return null;
      try {
        type WebkitWindow = Window & {
          webkitAudioContext?: typeof AudioContext;
        };
        const AC =
          window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
        return AC ? new AC() : null;
      } catch {
        return null;
      }
    })();
    if (!ctx) return;
    if (typeof window !== "undefined" &&
        window.localStorage?.getItem("imposter:muted") === "1") {
      return;
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const t0 = ctx.currentTime;
    // C major triad arpeggio + held chord (C-E-G-C)
    const ladder = [523.25, 659.25, 783.99, 1046.5];
    const playTone = (
      f: number,
      start: number,
      dur: number,
      peak = 0.18
    ) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(peak, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + dur + 0.05);
    };
    ladder.forEach((f, i) => playTone(f, t0 + i * 0.09, 0.55, 0.16));
    // Final held chord
    playTone(523.25, t0 + 0.5, 1.2, 0.12);
    playTone(659.25, t0 + 0.5, 1.2, 0.1);
    playTone(783.99, t0 + 0.5, 1.2, 0.1);
    return () => {
      cancelled = true;
      // Best-effort cleanup; chord is short.
      void cancelled;
    };
  }, [variant]);

  if (variant === "loss") return null;

  const primary = variant === "win" ? "bg-leaf" : "bg-accent";
  const alt = variant === "win" ? "bg-accent" : "bg-leaf";

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center overflow-hidden"
    >
      {burst.map((p) => (
        <motion.span
          key={`b-${p.id}`}
          initial={{ x: 0, y: 0, opacity: 1, scale: 0.5, rotate: 0 }}
          animate={{
            x: p.x,
            y: p.y,
            opacity: 0,
            scale: 1,
            rotate: p.rotate,
          }}
          transition={{
            duration: 1.8,
            delay: p.delay,
            ease: [0.16, 0.84, 0.3, 1],
          }}
          className={`absolute ${
            p.square ? "rounded-[2px]" : "rounded-sm"
          } ${p.alt ? alt : primary}`}
          style={{
            width: p.size,
            height: p.square ? p.size : p.size * 0.4,
          }}
        />
      ))}
      {rain.map((p) => (
        <motion.span
          key={`r-${p.id}`}
          initial={{
            x: p.xStart,
            y: -600,
            opacity: 0,
            rotate: 0,
          }}
          animate={{
            x: p.xEnd,
            y: 700,
            opacity: [0, 1, 1, 0],
            rotate: p.rotate,
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            ease: "easeIn",
            times: [0, 0.1, 0.85, 1],
          }}
          className={`absolute ${
            p.square ? "rounded-[2px]" : "rounded-sm"
          } ${p.alt ? alt : primary}`}
          style={{
            width: p.size,
            height: p.square ? p.size : p.size * 0.4,
          }}
        />
      ))}
    </div>
  );
}

// Pulsing dots while waiting for the next reveal stage to fire. Keeps
// the layout from collapsing as content fades in/out and gives the
// pause an actual presence (so the table reads it as "wait for it..."
// instead of "the screen is broken").
function RevealEllipsis() {
  return (
    <span className="inline-flex gap-1 text-3xl text-ink-faint/40">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          animate={{ opacity: [0.2, 0.9, 0.2] }}
          transition={{
            duration: 1.4,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.2,
          }}
        >
          ·
        </motion.span>
      ))}
    </span>
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

  const youAreImposter = reveal.imposterIds.includes(playerId);
  const caught = reveal.caught;
  const outcome = reveal.guessOutcome;

  // Tiered reveal: unspool the round resolution over a few seconds
  // instead of dumping everything at once.
  //   stage 0 (immediate): "The imposter was..." header only
  //   stage 1 (~1.4s):     imposter name(s) appear  (chime)
  //   stage 2 (~1.4s):     secret word appears      (chime)
  //   stage 3 (~1.4s):     imposter's guess appears (chime, if any)
  //   stage 4 (~1.0s):     outcome banner + confetti + everything else
  const hasGuess = !!reveal.guess;
  const finalStage = hasGuess ? 4 : 3;
  const [stage, setStage] = useState(0);
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const advance = (s: number, delay: number) => {
      timers.push(
        setTimeout(() => {
          setStage(s);
          if (s < finalStage) playRevealStageChime(s);
        }, delay)
      );
    };
    let t = 1400;
    advance(1, t);
    advance(2, (t += 1400));
    if (hasGuess) advance(3, (t += 1400));
    advance(finalStage, (t += hasGuess ? 1400 : 1400));
    return () => {
      for (const x of timers) clearTimeout(x);
    };
  }, [hasGuess, finalStage]);
  const multiImposter = reveal.imposterIds.length > 1;

  type Side = "imposter" | "crewmates" | "draw";
  const winner: Side = !caught
    ? "imposter"
    : outcome === "exact"
      ? "imposter"
      : outcome === "close"
        ? "draw"
        : "crewmates";

  const youWon =
    winner === "draw"
      ? false
      : (youAreImposter && winner === "imposter") ||
        (!youAreImposter && winner === "crewmates");
  const youDrew = winner === "draw";

  const pointsEarned = youAreImposter
    ? !caught
      ? 2
      : outcome === "exact"
        ? 2
        : outcome === "close"
          ? 1
          : 0
    : caught && outcome !== "exact"
      ? 1
      : 0;

  const outcomeLabel = !caught
    ? "Imposter slips away"
    : outcome === "exact"
      ? "Imposter guessed the word"
      : outcome === "close"
        ? "Split decision"
        : "Crewmates prevail";

  const imposterWord = multiImposter ? "imposters" : "imposter";
  // Lock in one line for the lifetime of this reveal mount so re-renders
  // (e.g. from realtime view updates) don't reroll the copy.
  const subtitle = useMemo(
    () =>
      pickRevealLine({
        youAreImposter,
        caught,
        outcome,
        imposterWord,
      }),
    [youAreImposter, caught, outcome, imposterWord]
  );

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

  // Per-player delta from this match, derived from reveal data:
  //   imposters escape          → imposters +2, crew +0
  //   caught + exact guess      → imposters +2, crew +0
  //   caught + close guess      → everyone +1
  //   caught + wrong guess      → crew +1, imposters +0
  // This mirrors the server scoring in vote/route.ts and guess/route.ts.
  const roundDeltas: Record<string, number> = {};
  const imposterIdSet = new Set(reveal.imposterIds);
  for (const p of view.players) {
    const isImp = imposterIdSet.has(p.id);
    let d = 0;
    if (!caught) {
      d = isImp ? 2 : 0;
    } else if (outcome === "exact") {
      d = isImp ? 2 : 0;
    } else if (outcome === "close") {
      d = 1;
    } else {
      d = isImp ? 0 : 1;
    }
    roundDeltas[p.id] = d;
  }

  const showFinal = stage >= finalStage;

  return (
    <>
      {showFinal && (
        <RevealConfetti
          variant={youDrew ? "draw" : youWon ? "win" : "loss"}
        />
      )}

      <AnimatePresence>
        {showFinal && (
          <motion.section
            key="outcome-banner"
            initial={{ opacity: 0, y: -12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{
              type: "spring",
              stiffness: 320,
              damping: 26,
            }}
            className={`relative border-2 p-10 text-center ${
              youDrew
                ? "border-accent bg-accent/5"
                : youWon
                  ? "border-leaf bg-leaf/5"
                  : "border-oxblood bg-oxblood/5"
            }`}
          >
            <motion.div
              animate={
                youWon
                  ? {
                      scale: [1, 1.06, 1],
                      textShadow: [
                        "0 0 0px rgba(107,127,92,0)",
                        "0 0 24px rgba(107,127,92,0.55)",
                        "0 0 0px rgba(107,127,92,0)",
                      ],
                    }
                  : { scale: 1 }
              }
              transition={
                youWon
                  ? { duration: 2.4, repeat: 2, ease: "easeInOut" }
                  : { duration: 0 }
              }
              className={`font-serif text-6xl italic ${
                youDrew ? "text-accent" : youWon ? "text-leaf" : "text-oxblood"
              }`}
            >
              {youDrew ? "Split point" : youWon ? "You won" : "You lost"}
            </motion.div>
            <div className="mt-4 text-sm text-ink-soft">{subtitle}</div>
            {pointsEarned > 0 && (
              <div className="mt-5 inline-block border border-ink px-4 py-1 text-[11px] uppercase tracking-[0.2em] text-ink">
                +{pointsEarned} point{pointsEarned === 1 ? "" : "s"}
              </div>
            )}
          </motion.section>
        )}
      </AnimatePresence>

      <section className="border border-line bg-surface p-8 text-center">
        <div className="text-[11px] uppercase tracking-[0.22em] text-ink-faint">
          {multiImposter ? "The imposters were" : "The imposter was"}
        </div>
        <div className="mt-3 flex min-h-[2.5rem] flex-wrap items-baseline justify-center gap-x-4 gap-y-2 font-serif text-3xl italic text-oxblood">
          {stage >= 1 ? (
            reveal.imposterIds.map((id, i) => (
              <motion.span
                key={id}
                initial={{ opacity: 0, y: -8, scale: 0.85, rotateX: -60 }}
                animate={{ opacity: 1, y: 0, scale: 1, rotateX: 0 }}
                transition={{
                  type: "spring",
                  stiffness: 360,
                  damping: 24,
                  delay: i * 0.18,
                }}
                className="inline-flex items-baseline gap-3"
              >
                {i > 0 && (
                  <span className="text-lg text-ink-faint">&</span>
                )}
                <span>{nicknameById.get(id) ?? "?"}</span>
                {reveal.caughtImposterId === id && multiImposter && (
                  <span className="text-[11px] uppercase tracking-[0.2em] text-accent">
                    caught
                  </span>
                )}
              </motion.span>
            ))
          ) : (
            <RevealEllipsis />
          )}
        </div>

        <div className="mt-6 border-t border-line-soft pt-6">
          <div className="text-[11px] uppercase tracking-[0.22em] text-ink-faint">
            Secret word
          </div>
          <div className="mt-2 flex min-h-[2.5rem] items-center justify-center font-serif text-3xl text-ink">
            {stage >= 2 ? (
              <motion.span
                initial={{ opacity: 0, y: -8, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 360, damping: 24 }}
              >
                {reveal.secretWord}
              </motion.span>
            ) : (
              <RevealEllipsis />
            )}
          </div>
          {stage >= 2 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="mt-2 text-xs text-ink-faint"
            >
              Category · {view.category}
            </motion.div>
          )}
        </div>

        {reveal.guess && (
          <div className="mt-6 border-t border-line-soft pt-6">
            <div className="text-[11px] uppercase tracking-[0.22em] text-ink-faint">
              Imposter guessed
            </div>
            <div className="mt-2 flex min-h-[2rem] items-center justify-center gap-3">
              {stage >= 3 ? (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{
                    type: "spring",
                    stiffness: 360,
                    damping: 24,
                  }}
                  className="flex items-center gap-3"
                >
                  <span className="font-serif text-2xl italic text-ink">
                    {reveal.guess}
                  </span>
                  <span
                    className={`rounded-sm px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] ${
                      reveal.guessOutcome === "exact"
                        ? "bg-leaf text-white"
                        : reveal.guessOutcome === "close"
                          ? "bg-accent text-white"
                          : "bg-oxblood text-white"
                    }`}
                  >
                    {reveal.guessOutcome}
                  </span>
                </motion.div>
              ) : (
                <RevealEllipsis />
              )}
            </div>
          </div>
        )}

        {showFinal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 }}
            className="mt-5 text-[11px] uppercase tracking-[0.2em] text-ink-soft"
          >
            {outcomeLabel}
          </motion.div>
        )}
      </section>

      <AnimatePresence>
        {showFinal && (
          <motion.div
            key="reveal-tail"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, ease: "easeOut" }}
            className="flex flex-col gap-7"
          >
      {view.guessCandidates.length > 0 && (
        <section className="space-y-3">
          <div className="text-[11px] uppercase tracking-[0.22em] text-ink-faint">
            The shortlist
          </div>
          <div className="flex flex-wrap gap-2">
            {view.guessCandidates.map((c) => {
              const isSecret =
                reveal.secretWord &&
                c.toLowerCase() === reveal.secretWord.toLowerCase();
              const isGuess =
                reveal.guess &&
                c.toLowerCase() === reveal.guess.toLowerCase();
              return (
                <span
                  key={c}
                  className={`rounded-full border px-3 py-1 font-serif text-sm ${
                    isSecret
                      ? "border-leaf bg-leaf/10 text-leaf"
                      : isGuess
                        ? "border-oxblood bg-oxblood/10 text-oxblood"
                        : "border-line bg-page text-ink-soft"
                  }`}
                >
                  {c}
                </span>
              );
            })}
          </div>
        </section>
      )}

      <ClueLog view={view} code={code} playerId={playerId} />

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
              <span className="font-serif text-ink">
                → {nicknameById.get(v.target_id)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {view.payouts.length > 0 && (
        <section className="space-y-3 border border-accent/30 bg-accent/5 p-5">
          <div className="flex items-baseline justify-between">
            <SectionLabel>Pot payout</SectionLabel>
            <span className="text-[11px] uppercase tracking-[0.2em] text-ink-faint">
              {view.payouts[0].kind === "refund" ? "refunded" : "settled"}
            </span>
          </div>
          <ul className="divide-y divide-line-soft">
            {view.payouts.map((p, i) => {
              const player = view.players.find(
                (pl) => pl.walletAddress === p.wallet
              );
              const label = player?.nickname ?? shortAddress(p.wallet);
              return (
                <li
                  key={i}
                  className="flex items-baseline justify-between py-2 text-sm"
                >
                  <span className="text-ink-soft">{label}</span>
                  <span className="flex items-baseline gap-3">
                    <span className="font-serif text-ink tabular-nums">
                      {formatUsdc(p.amount)} USDC
                    </span>
                    <a
                      href={blockExplorerUrl(p.txHash)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] uppercase tracking-[0.2em] text-accent hover:text-ink"
                    >
                      tx ↗
                    </a>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="space-y-4">
        <SectionLabel>Scoreboard</SectionLabel>
        <PlayerList
          view={{ ...view, players: sortedPlayers }}
          deltas={roundDeltas}
        />
      </section>

      {isHost ? (
        <div className="flex gap-3">
          <button
            onClick={playAgain}
            disabled={restarting}
            className="flex-1 rounded-sm bg-ink px-6 py-4 text-[11px] uppercase tracking-[0.2em] text-page transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-30"
          >
            {restarting ? "..." : "Play again"}
          </button>
          <button
            onClick={() => router.push("/")}
            className="rounded-sm border border-ink px-6 py-4 text-[11px] uppercase tracking-[0.2em] text-ink transition hover:bg-ink hover:text-page"
          >
            Exit
          </button>
        </div>
      ) : (
        <p className="text-center text-[11px] uppercase tracking-[0.2em] text-ink-faint">
          Awaiting the host
        </p>
      )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
