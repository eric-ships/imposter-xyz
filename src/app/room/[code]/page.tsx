"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { supabase } from "@/lib/supabase/browser";
import type { PublicRoomView, RoomState } from "@/lib/game";
import { blockExplorerUrl } from "@/lib/chain";
import {
  DEFAULT_ALLOWANCE,
  DEFAULT_PERIOD_DAYS,
  grantSpendPermissionForPot,
  useBaseAccount,
} from "@/lib/wallet";
import {
  isMuted as audioIsMuted,
  playTimerTick,
  playTurnChime,
  primeAudio,
  setMuted as audioSetMuted,
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
  useTurnChime(view, playerId);
  useAudioPriming();

  const timedState: "playing" | "voting" | "guessing" | null =
    view.state === "playing" ||
    view.state === "voting" ||
    view.state === "guessing"
      ? view.state
      : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-7 px-8 py-8">
      <header className="flex items-center justify-between border-b border-line pb-3 text-[10px] uppercase tracking-[0.35em] text-ink-faint">
        <span className="flex items-baseline gap-2">
          <span>Room</span>
          <span className="font-serif text-base tracking-[0.25em] text-ink normal-case">
            {code}
          </span>
        </span>
        <span className="flex items-center gap-3">
          <Link
            href="/rules"
            target="_blank"
            rel="noreferrer"
            className="text-[10px] uppercase tracking-[0.3em] text-ink-faint transition hover:text-ink"
            title="How to play"
          >
            Rules
          </Link>
          <MuteToggle />
          <span className="flex items-baseline gap-2">
            <span className="font-serif text-base italic text-ink normal-case tracking-normal">
              {nicknameById.get(playerId)}
            </span>
            {you.isHost && (
              <span className="rounded-sm border border-accent/60 px-1.5 py-0.5 text-[9px] tracking-[0.3em] text-accent">
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
        />
      )}

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
}: {
  code: string;
  deadline: string;
  state: "playing" | "voting" | "guessing";
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
  // pitch on the last 5 to escalate the tension.
  useEffect(() => {
    if (seconds <= 0 || seconds > 10) return;
    if (lastTickSecondRef.current === seconds) return;
    lastTickSecondRef.current = seconds;
    playTimerTick(critical);
  }, [seconds, critical]);

  const label =
    state === "playing"
      ? "Clue timer"
      : state === "voting"
        ? "Vote timer"
        : "Guess timer";

  return (
    <section
      aria-live="polite"
      className="relative overflow-hidden border-y border-line bg-surface/60 px-5 py-4"
    >
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-[0.4em] text-ink-faint">
          {label}
        </span>
        <motion.span
          key={critical ? "crit" : warn ? "warn" : "ok"}
          animate={
            critical ? { scale: [1, 1.04, 1] } : { scale: 1 }
          }
          transition={
            critical
              ? { duration: 0.9, repeat: Infinity, ease: "easeInOut" }
              : { duration: 0.18 }
          }
          className={`font-serif text-5xl italic tabular-nums leading-none transition-colors ${
            critical
              ? "text-oxblood"
              : warn
                ? "text-oxblood"
                : "text-ink"
          }`}
        >
          {display}
          {mins === 0 && <span className="ml-0.5 text-2xl">s</span>}
        </motion.span>
      </div>
      <div className="mt-3 h-0.5 overflow-hidden bg-line-soft">
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
        className={`text-[10px] uppercase tracking-[0.3em] transition ${
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
  showAnte = false,
  showRank = false,
}: {
  view: PublicRoomView;
  showScores?: boolean;
  showAnte?: boolean;
  showRank?: boolean;
}) {
  return (
    <ul className="divide-y divide-line-soft border-y border-line-soft">
      {view.players.map((p, i) => {
        const { color, initial } = avatarFor(p.id, p.nickname);
        return (
          <li key={p.id} className="flex items-center gap-4 py-3">
            {showRank && (
              <div className="w-4 text-right font-serif text-sm italic text-ink-faint tabular-nums">
                {i + 1}
              </div>
            )}
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
              {showAnte && (
                <div className="mt-0.5 text-[10px] uppercase tracking-[0.25em] text-ink-faint">
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
          className="w-full rounded-sm border border-ink px-4 py-3 text-[11px] uppercase tracking-[0.3em] text-ink transition hover:bg-ink hover:text-page disabled:opacity-40"
        >
          {hostToggling ? "Enabling..." : "Enable 1 USDC pot"}
        </button>
        <p className="text-[10px] uppercase tracking-[0.3em] text-ink-faint">
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
            className="text-[10px] uppercase tracking-[0.3em] text-ink-faint hover:text-oxblood"
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
          <div className="text-[10px] uppercase tracking-[0.3em] text-ink-faint">
            {pot.paidCount} of {playerCount} anted · {formatUsdc(pot.anteAmount)} each
          </div>
        </div>
        {pot.chainCreateTx && (
          <a
            href={blockExplorerUrl(pot.chainCreateTx)}
            target="_blank"
            rel="noreferrer"
            className="text-[10px] uppercase tracking-[0.3em] text-accent hover:text-ink"
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
            <div className="mt-1 text-[10px] uppercase tracking-[0.25em] text-leaf/80">
              {shortAddress(address)} · {formatUsdc(DEFAULT_ALLOWANCE)} USDC
              / {DEFAULT_PERIOD_DAYS} days
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {address && (
            <div className="text-[10px] uppercase tracking-[0.25em] text-ink-faint">
              Wallet: {shortAddress(address)}
            </div>
          )}
          <button
            onClick={doGrantPermission}
            disabled={granting || isConnecting}
            className="w-full rounded-sm bg-ink px-4 py-3 text-[11px] uppercase tracking-[0.3em] text-page transition hover:bg-accent disabled:opacity-40"
          >
            {granting
              ? "Authorizing..."
              : isConnecting
                ? "Connecting..."
                : address
                  ? `Authorize ${formatUsdc(DEFAULT_ALLOWANCE)} USDC`
                  : `Connect & authorize ${formatUsdc(DEFAULT_ALLOWANCE)} USDC`}
          </button>
          <p className="text-[10px] uppercase tracking-[0.25em] text-ink-faint">
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
              : `Players · ${view.players.length} of 5`}
          </SectionLabel>
          {anyScore && (
            <span className="text-[10px] uppercase tracking-[0.3em] text-ink-faint">
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
          disabled={!startReady || starting}
          className="rounded-sm bg-ink px-6 py-4 text-[11px] uppercase tracking-[0.3em] text-page transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-30"
        >
          {startLabel}
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

      <div className="flex justify-center border-t border-line-soft pt-6">
        <Link
          href="/rules"
          target="_blank"
          rel="noreferrer"
          className="text-[10px] uppercase tracking-[0.3em] text-ink-faint transition hover:text-ink"
        >
          How to play
        </Link>
      </div>
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
            },
          ],
          turnIndex: nextTurnIndex,
        }
      : view;

  const nicknameById = new Map(view.players.map((p) => [p.id, p.nickname]));
  const currentPlayerId = view.turnOrder[view.turnIndex];
  const isMyTurn = currentPlayerId === playerId && !optimisticClue;
  const iAmNext =
    !isMyTurn && view.turnOrder[nextTurnIndex] === playerId && !optimisticClue;
  const you = view.you!;
  const waitingFor = optimisticClue
    ? view.turnOrder[nextTurnIndex]
    : currentPlayerId;

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
      <section className="flex items-baseline justify-between pb-1">
        <span className="font-serif text-base italic text-ink-soft">
          {view.category}
        </span>
        <span className="text-[10px] uppercase tracking-[0.35em] text-ink-faint">
          Round {view.round} / {view.totalRounds}
        </span>
      </section>

      <section className="relative border-y border-line bg-surface/70 py-7 text-center">
        <span className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 bg-page px-3 text-[10px] uppercase tracking-[0.4em]">
          <span className={you.isImposter ? "text-oxblood" : "text-leaf"}>
            {you.isImposter ? "Imposter" : "Your word"}
          </span>
        </span>
        {you.isImposter ? (
          <div className="font-serif text-2xl italic text-ink">
            Bluff · Find the word
          </div>
        ) : (
          <div className="font-serif text-4xl font-semibold leading-none tracking-tight text-ink">
            {you.secretWord}
          </div>
        )}
      </section>

      <TurnStrip view={displayView} playerId={playerId} />

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
            className="absolute -top-px left-1/2 -translate-x-1/2 -translate-y-1/2 bg-page px-3 text-[10px] uppercase tracking-[0.45em] text-accent"
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
                maxLength={40}
                placeholder="e.g. syrup"
                autoFocus
                className="flex-1 border-b-2 border-accent bg-transparent px-1 pb-2 font-serif text-2xl italic text-ink outline-none transition placeholder:text-ink-faint/70 focus:border-ink"
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
        </motion.div>
      ) : (
        <p className="text-center text-[11px] uppercase tracking-[0.3em]">
          {iAmNext ? (
            <>
              <span className="text-accent">You&apos;re up next</span>
              <span className="text-ink-faint">
                {" "}
                · Awaiting {nicknameById.get(waitingFor)}
              </span>
            </>
          ) : (
            <span className="text-ink-faint">
              Awaiting {nicknameById.get(waitingFor)}
            </span>
          )}
        </p>
      )}

      <ClueLog view={displayView} />
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
                className={`relative flex h-12 w-12 items-center justify-center rounded-full text-base font-semibold text-white ${color}`}
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
              className={`max-w-[72px] truncate text-[10px] uppercase tracking-[0.15em] transition-colors ${
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

  const activeRound = view.state === "playing" ? view.round : null;

  return (
    <section className="space-y-4">
      <SectionLabel>Clues</SectionLabel>
      <div className="space-y-6">
        {Object.entries(rounds)
          .sort(([a], [b]) => Number(b) - Number(a))
          .map(([round, clues]) => {
            const roundNum = Number(round);
            const isActive = activeRound === roundNum;
            return (
              <div key={round}>
                <div
                  className={`mb-2 flex items-baseline justify-between text-[10px] uppercase tracking-[0.3em] ${
                    isActive ? "text-accent" : "text-ink-faint"
                  }`}
                >
                  <span>Round {round}</span>
                  {isActive && <span>In progress</span>}
                </div>
                <ul className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
                  <AnimatePresence initial={false}>
                    {[...clues].reverse().map((c) => {
                      const nickname = nicknameById.get(c.player_id) ?? "";
                      const { color, initial } = avatarFor(
                        c.player_id,
                        nickname
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
                          <div className="flex items-center gap-4 py-3">
                            <div
                              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white ${color}`}
                            >
                              {initial}
                            </div>
                            <span
                              className="max-w-[88px] shrink-0 truncate text-xs uppercase tracking-[0.15em] text-ink-faint"
                              title={nickname}
                            >
                              {nickname}
                            </span>
                            <span className="min-w-0 flex-1 break-words text-right font-serif text-xl italic text-ink">
                              {c.word}
                            </span>
                          </div>
                        </motion.li>
                      );
                    })}
                  </AnimatePresence>
                </ul>
              </div>
            );
          })}
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
    <>
      <section className="flex items-center justify-between border-b border-line pb-3 text-[10px] uppercase tracking-[0.35em] text-ink-faint">
        <span className="font-serif text-sm italic text-ink-soft normal-case tracking-normal">
          {view.category}
        </span>
        {!you.isImposter && you.secretWord && (
          <span>
            Word
            <span className="ml-2 font-serif text-sm italic text-ink normal-case tracking-normal">
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
          <div className="mt-1 text-[10px] uppercase tracking-[0.3em] text-ink-faint">
            {alreadyVoted
              ? `Vote locked · ${votesReceived} of ${totalPlayers}`
              : `Cast your vote · ${votesReceived} of ${totalPlayers} in`}
          </div>
        </div>
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
                className={`flex w-full items-center gap-4 px-3 py-5 text-left transition ${
                  selected ? "bg-accent/10 ring-1 ring-accent/40" : ""
                } ${isYou || alreadyVoted ? "opacity-40" : "hover:bg-cream/40"}`}
              >
                <div
                  className={`flex h-11 w-11 items-center justify-center rounded-full text-base font-semibold text-white ${color}`}
                >
                  {initial}
                </div>
                <div className="flex-1 font-serif text-xl text-ink">
                  {p.nickname}
                  {isYou && (
                    <span className="ml-2 font-sans text-[10px] uppercase tracking-[0.3em] text-ink-faint">
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
        {!alreadyVoted && (
          <button
            onClick={submit}
            disabled={!target || submitting}
            className="w-full rounded-sm bg-ink px-6 py-4 text-[11px] uppercase tracking-[0.3em] text-page transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-30"
          >
            {submitting ? "Submitting" : "Lock in vote"}
          </button>
        )}
        {error && (
          <p className="border-l-2 border-oxblood bg-oxblood/5 px-4 py-2 text-sm text-oxblood">
            {error}
          </p>
        )}
      </section>

      <ClueLog view={view} />
    </>
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

  // Fetch the pickable list once when this player is the caught imposter.
  // Cached server-side per round, so refreshes return the same list.
  useEffect(() => {
    if (!you.isCaughtImposter) return;
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
        // Non-fatal: imposter can still type a free guess.
      })
      .finally(() => {
        if (!cancelled) setCandidatesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [you.isCaughtImposter, code, playerId]);

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
      <>
        <section className="border border-line bg-surface p-8 text-center">
          <div className="text-[10px] uppercase tracking-[0.4em] text-accent">
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
        </section>

        <p className="text-center text-[11px] uppercase tracking-[0.3em] text-ink-faint">
          Awaiting {caughtNickname}&apos;s guess
        </p>

        <ClueLog view={view} />
      </>
    );
  }

  return (
    <>
      <section className="border-2 border-accent bg-accent/5 p-8 text-center">
        <div className="text-[10px] uppercase tracking-[0.4em] text-accent">
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
            className="rounded-sm bg-ink px-5 text-[11px] uppercase tracking-[0.3em] text-page transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-30"
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
          <div className="text-[10px] uppercase tracking-[0.3em] text-ink-faint">
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
                    className={`rounded-full border px-3 py-1 font-serif text-sm italic transition ${
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

      <section className="flex items-center justify-between text-[10px] uppercase tracking-[0.35em] text-ink-faint">
        <span>Category</span>
        <span className="font-serif text-sm italic text-ink-soft normal-case tracking-normal">
          {view.category}
        </span>
      </section>

      <ClueLog view={view} />
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

  const youAreImposter = reveal.imposterIds.includes(playerId);
  const caught = reveal.caught;
  const outcome = reveal.guessOutcome;
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
  const theyWord = multiImposter ? "them" : "them";
  const subtitle = youAreImposter
    ? !caught
      ? "You fooled them all."
      : outcome === "exact"
        ? "You were caught, but the word was guessed."
        : outcome === "close"
          ? "Close enough. The table splits the point."
          : "The guess missed. The crewmates take it."
    : !caught
      ? `The ${imposterWord} slipped past you.`
      : outcome === "exact"
        ? `You caught ${theyWord}, but the word was named.`
        : outcome === "close"
          ? `Caught, but the guess was nearly right.`
          : `You caught the ${imposterWord} clean.`;

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
          youDrew
            ? "border-accent bg-accent/5"
            : youWon
              ? "border-leaf bg-leaf/5"
              : "border-oxblood bg-oxblood/5"
        }`}
      >
        <div
          className={`font-serif text-6xl italic ${
            youDrew ? "text-accent" : youWon ? "text-leaf" : "text-oxblood"
          }`}
        >
          {youDrew ? "Split point" : youWon ? "You won" : "You lost"}
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
          {multiImposter ? "The imposters were" : "The imposter was"}
        </div>
        <div className="mt-3 flex flex-wrap items-baseline justify-center gap-x-4 gap-y-2 font-serif text-3xl italic text-oxblood">
          {reveal.imposterIds.map((id, i) => (
            <span key={id} className="inline-flex items-baseline gap-3">
              {i > 0 && (
                <span className="text-lg text-ink-faint">&</span>
              )}
              <span>{nicknameById.get(id) ?? "?"}</span>
              {reveal.caughtImposterId === id && multiImposter && (
                <span className="text-[10px] uppercase tracking-[0.3em] text-accent">
                  caught
                </span>
              )}
            </span>
          ))}
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
        {reveal.guess && (
          <div className="mt-6 border-t border-line-soft pt-6">
            <div className="text-[10px] uppercase tracking-[0.4em] text-ink-faint">
              Imposter guessed
            </div>
            <div className="mt-2 flex items-center justify-center gap-3">
              <span className="font-serif text-2xl italic text-ink">
                {reveal.guess}
              </span>
              <span
                className={`rounded-sm px-2 py-0.5 text-[9px] uppercase tracking-[0.3em] ${
                  reveal.guessOutcome === "exact"
                    ? "bg-leaf text-white"
                    : reveal.guessOutcome === "close"
                      ? "bg-accent text-white"
                      : "bg-oxblood text-white"
                }`}
              >
                {reveal.guessOutcome}
              </span>
            </div>
          </div>
        )}
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

      {view.payouts.length > 0 && (
        <section className="space-y-3 border border-accent/30 bg-accent/5 p-5">
          <div className="flex items-baseline justify-between">
            <SectionLabel>Pot payout</SectionLabel>
            <span className="text-[10px] uppercase tracking-[0.3em] text-ink-faint">
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
                    <span className="font-serif italic text-ink">
                      {formatUsdc(p.amount)} USDC
                    </span>
                    <a
                      href={blockExplorerUrl(p.txHash)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] uppercase tracking-[0.3em] text-accent hover:text-ink"
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
