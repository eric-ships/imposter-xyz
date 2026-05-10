"use client";

// /spectate/[code] — read-only room view. Built for two audiences:
//   1) Streamers using OBS — add this URL as a browser source. The
//      streamer plays on their phone (where they see their secrets);
//      OBS shows this URL to the audience with all per-player
//      secrets server-side-redacted.
//   2) Friends watching a game from the sidelines — anyone with the
//      room code can drop in and follow along.
//
// No auth, no controls, no inputs. Updates in real-time via the
// same Supabase channel the room page uses. Server-side redaction
// in /lib/room-state.ts already hides imposter's secret word + the
// wavelength target from null-playerId viewers; just-one's secret
// word stays visible (audience-friendly default — the drama is in
// the guesser figuring it out).
import {
  use,
  useCallback,
  useEffect,
  useState,
} from "react";
import { supabase } from "@/lib/supabase/browser";
import { avatarFor } from "@/lib/avatar";
import type { PublicRoomView } from "@/lib/game";
import type { WavelengthState } from "@/games/wavelength/types";
import type { JustOneState } from "@/games/just-one/types";

export default function SpectatePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: rawCode } = use(params);
  const code = rawCode.toUpperCase();
  const [view, setView] = useState<PublicRoomView | null>(null);
  const [notFound, setNotFound] = useState(false);

  const refetch = useCallback(async () => {
    // No playerId → server fetches in spectator mode. Wavelength
    // target hidden; imposter secret/imposter-id only exposed via
    // view.reveal at reveal phase.
    const res = await fetch(`/api/rooms/${code}`);
    if (res.status === 404) {
      setNotFound(true);
      return;
    }
    const data = (await res.json()) as PublicRoomView;
    setView(data);
  }, [code]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  // Polling fallback (mirrors room page) so realtime hiccups don't
  // freeze the OBS overlay.
  useEffect(() => {
    const iv = setInterval(() => refetch(), 3000);
    return () => clearInterval(iv);
  }, [refetch]);

  // Realtime subscription for snappier updates.
  useEffect(() => {
    const channel = supabase
      .channel(`room_events:spectate:${code}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "room_events",
          filter: `room_code=eq.${code}`,
        },
        () => refetch()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [code, refetch]);

  if (notFound) {
    return (
      <Shell>
        <div className="text-center text-sm text-ink-soft">
          No room with code{" "}
          <span className="font-semibold tracking-[0.15em] text-ink">
            {code}
          </span>
          .
        </div>
      </Shell>
    );
  }
  if (!view) {
    return (
      <Shell>
        <div className="text-[11px] uppercase tracking-[0.22em] text-ink-faint">
          Loading
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <Header view={view} code={code} />
      {view.kind === "wavelength" ? (
        <WavelengthView view={view} />
      ) : view.kind === "just-one" ? (
        <JustOneView view={view} />
      ) : (
        <ImposterView view={view} />
      )}
      <Scoreboard view={view} />
    </Shell>
  );
}

// ─── Layout ────────────────────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  // No sticky chrome, no theme toggle, no menu. Pure content for
  // OBS-friendly screen capture. Wide layout — caller sets max
  // width for tablet/laptop visual comfort.
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-6 py-8 sm:gap-8 sm:py-12 lg:max-w-4xl lg:py-16">
      {children}
    </main>
  );
}

function Header({ view, code }: { view: PublicRoomView; code: string }) {
  const kindLabel =
    view.kind === "wavelength"
      ? "Wavelength"
      : view.kind === "just-one"
        ? "Just One"
        : "Imposter";
  return (
    <header className="flex items-center justify-between border-b border-line pb-3">
      <span className="flex items-baseline gap-3 text-[11px] uppercase tracking-[0.22em] text-ink-faint">
        <span className="font-serif text-2xl italic normal-case tracking-tight text-ink">
          Upper
        </span>
        <span>·</span>
        <span>{kindLabel}</span>
        {view.groupName && (
          <>
            <span>·</span>
            <span className="text-leaf normal-case tracking-normal">
              {view.groupName}
            </span>
          </>
        )}
      </span>
      <span className="flex items-baseline gap-2 text-[11px] uppercase tracking-[0.22em] text-ink-faint">
        <span>Room</span>
        <span className="text-base tracking-[0.25em] text-ink normal-case">
          {code}
        </span>
        <span className="ml-2 rounded-full border border-leaf/40 bg-leaf/5 px-2 py-0.5 text-[10px] tracking-[0.2em] text-leaf">
          Spectator
        </span>
      </span>
    </header>
  );
}

// ─── Imposter ─────────────────────────────────────────────────────

function ImposterView({ view }: { view: PublicRoomView }) {
  const phase = view.state;
  if (phase === "lobby") {
    return (
      <Center>
        <PhaseBadge>Lobby</PhaseBadge>
        <Headline>Waiting for the host to start</Headline>
        <Subtle>{view.players.length} of 8 players in the room</Subtle>
      </Center>
    );
  }

  if (phase === "reveal" && view.reveal) {
    const r = view.reveal;
    const winnerLabel = !r.caught
      ? "Imposter slipped away"
      : r.guessOutcome === "exact"
        ? "Imposter guessed the word"
        : r.guessOutcome === "close"
          ? "Split decision"
          : "Crewmates prevailed";
    const imposterNames = r.imposterIds
      .map(
        (id) =>
          view.players.find((p) => p.id === id)?.nickname ?? "?"
      )
      .join(" & ");
    return (
      <div className="space-y-6 text-center">
        <PhaseBadge>Reveal</PhaseBadge>
        <Section label="Category">
          <Headline>{view.category}</Headline>
        </Section>
        <Section label="Secret word">
          <Hero>{r.secretWord}</Hero>
        </Section>
        <Section label="The imposter was">
          <div className="font-serif text-4xl text-oxblood lg:text-5xl">
            {imposterNames}
          </div>
        </Section>
        {r.guess && (
          <Section label="Imposter guessed">
            <div className="font-serif text-3xl text-ink lg:text-4xl">
              {r.guess}
            </div>
          </Section>
        )}
        <div className="inline-block border border-line px-4 py-1.5 text-[11px] uppercase tracking-[0.22em] text-ink-soft">
          {winnerLabel}
        </div>
      </div>
    );
  }

  // playing / voting / guessing — secret word is hidden from spectator
  // (only crewmates see it via you.secretWord; spectator has you=null)
  return (
    <div className="space-y-6 text-center">
      <PhaseBadge>
        {phase === "voting"
          ? "Voting"
          : phase === "guessing"
            ? "Caught — final guess"
            : `Round ${view.round} of ${view.totalRounds || 3}`}
      </PhaseBadge>
      <Section label="Category">
        <Headline>{view.category ?? "—"}</Headline>
      </Section>
      <ImposterClueLog view={view} />
      {phase === "voting" && (
        <Section label="Voting in progress">
          <Subtle>
            {view.votes.length} of {view.players.length} votes locked
          </Subtle>
        </Section>
      )}
    </div>
  );
}

function ImposterClueLog({ view }: { view: PublicRoomView }) {
  if (view.clues.length === 0) return null;
  // Group clues by round, newest round first.
  const rounds: Record<number, typeof view.clues> = {};
  for (const c of view.clues) {
    (rounds[c.round] ??= []).push(c);
  }
  const sorted = Object.entries(rounds).sort(
    ([a], [b]) => Number(b) - Number(a)
  );
  return (
    <div className="space-y-4">
      {sorted.map(([round, clues]) => (
        <div key={round} className="space-y-2">
          <div className="text-[11px] uppercase tracking-[0.22em] text-ink-faint">
            Round {round} · {clues.length}{" "}
            {clues.length === 1 ? "clue" : "clues"}
          </div>
          <ul className="divide-y divide-line-soft border-y border-line-soft">
            {clues.map((c) => {
              const nick =
                view.players.find((p) => p.id === c.player_id)?.nickname ??
                "?";
              return (
                <li
                  key={`${c.player_id}-${c.round}`}
                  className="flex items-baseline justify-between gap-3 py-2"
                >
                  <span className="text-sm text-ink-soft">{nick}</span>
                  <span className="font-serif text-xl italic text-ink">
                    {c.word}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ─── Wavelength ───────────────────────────────────────────────────

function WavelengthView({ view }: { view: PublicRoomView }) {
  if (view.state === "lobby") {
    return (
      <Center>
        <PhaseBadge>Lobby</PhaseBadge>
        <Headline>Waiting for the host to start</Headline>
        <Subtle>{view.players.length} of 6 players</Subtle>
      </Center>
    );
  }
  const state = view.gameState as unknown as WavelengthState | undefined;
  if (!state || !state.phase) {
    return (
      <Center>
        <Subtle>Loading match…</Subtle>
      </Center>
    );
  }
  const psychic = state.psychicId
    ? view.players.find((p) => p.id === state.psychicId)?.nickname ?? "?"
    : "?";
  return (
    <div className="space-y-6 text-center">
      <PhaseBadge>
        Round {state.round} of {state.totalRounds} · Psychic{" "}
        <span className="text-accent">{psychic}</span>
      </PhaseBadge>
      {state.concept && (
        <Section label="Concept">
          <div className="flex items-baseline justify-between gap-4 border-y border-line-soft py-3">
            <span className="font-serif text-2xl text-ink lg:text-3xl">
              {state.concept.left}
            </span>
            <span className="text-ink-faint">↔</span>
            <span className="font-serif text-2xl text-ink lg:text-3xl">
              {state.concept.right}
            </span>
          </div>
        </Section>
      )}
      {state.clue && (
        <Section label="Clue">
          <Hero>{state.clue}</Hero>
        </Section>
      )}
      {state.phase === "guessing" && (
        <Subtle>
          {state.guesses.length} of{" "}
          {view.players.length - (state.psychicId ? 1 : 0)} guesses locked
        </Subtle>
      )}
      {state.phase === "reveal" && state.target !== null && (
        <Section label="Target landed at">
          <div className="font-serif text-5xl text-leaf lg:text-6xl">
            {state.target}
          </div>
          <div className="mt-2 text-xs text-ink-faint">
            Guesses:{" "}
            {state.guesses
              .map((g) => {
                const nick =
                  view.players.find((p) => p.id === g.playerId)?.nickname ??
                  "?";
                return `${nick} (${Math.round(g.position)})`;
              })
              .join(" · ")}
          </div>
        </Section>
      )}
    </div>
  );
}

// ─── Just One ─────────────────────────────────────────────────────

function JustOneView({ view }: { view: PublicRoomView }) {
  if (view.state === "lobby") {
    return (
      <Center>
        <PhaseBadge>Lobby</PhaseBadge>
        <Headline>Waiting for the host to start</Headline>
        <Subtle>{view.players.length} of 7 players</Subtle>
      </Center>
    );
  }
  const state = view.gameState as unknown as JustOneState | undefined;
  if (!state || !state.phase) {
    return (
      <Center>
        <Subtle>Loading match…</Subtle>
      </Center>
    );
  }
  const guesser = state.guesserId
    ? view.players.find((p) => p.id === state.guesserId)?.nickname ?? "?"
    : "?";
  return (
    <div className="space-y-6 text-center">
      <PhaseBadge>
        Card {state.cardIndex + 1} of {state.totalCards} · Guesser{" "}
        <span className="text-accent">{guesser}</span>
      </PhaseBadge>
      {state.secretWord && (
        <Section label="Secret word">
          <Hero>{state.secretWord}</Hero>
        </Section>
      )}
      {state.phase === "clue" && (
        <Subtle>
          {state.clues.length} of {view.players.length - 1} clues written
        </Subtle>
      )}
      {(state.phase === "guess" || state.phase === "reveal") &&
        state.clues.length > 0 && (
          <Section label="Clues">
            <ul className="divide-y divide-line-soft border-y border-line-soft">
              {state.clues.map((c) => {
                const nick = c.playerId
                  ? view.players.find((p) => p.id === c.playerId)
                      ?.nickname ?? "?"
                  : "anon";
                const eliminated = state.eliminatedPlayerIds.includes(
                  c.playerId
                );
                return (
                  <li
                    key={`${c.playerId}-${c.word}`}
                    className="flex items-baseline justify-between gap-3 py-2"
                  >
                    <span className="text-sm text-ink-soft">{nick}</span>
                    <span
                      className={`font-serif text-xl italic ${
                        eliminated ? "text-ink-faint line-through" : "text-ink"
                      }`}
                    >
                      {c.word}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Section>
        )}
      {state.phase === "reveal" && (
        <div
          className={`inline-block border-2 px-4 py-2 text-[11px] uppercase tracking-[0.22em] ${
            state.outcome === "correct"
              ? "border-leaf text-leaf"
              : state.outcome === "skipped"
                ? "border-line text-ink-faint"
                : "border-oxblood text-oxblood"
          }`}
        >
          {state.outcome === "correct"
            ? `Got it: ${state.guess}`
            : state.outcome === "skipped"
              ? "Skipped"
              : `Wrong: ${state.guess}`}
        </div>
      )}
    </div>
  );
}

// ─── Shared bits ───────────────────────────────────────────────────

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      {children}
    </div>
  );
}

function PhaseBadge({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] uppercase tracking-[0.22em] text-ink-faint">
      {children}
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="text-[11px] uppercase tracking-[0.22em] text-ink-faint">
        {label}
      </div>
      {children}
    </div>
  );
}

function Headline({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-serif text-3xl text-ink lg:text-4xl">
      {children}
    </div>
  );
}

function Hero({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-serif text-5xl text-ink lg:text-6xl">{children}</div>
  );
}

function Subtle({ children }: { children: React.ReactNode }) {
  return <div className="text-sm text-ink-soft">{children}</div>;
}

function Scoreboard({ view }: { view: PublicRoomView }) {
  if (view.players.length === 0) return null;
  const sorted = [...view.players].sort((a, b) => b.score - a.score);
  return (
    <section className="space-y-2 border-t border-line pt-4">
      <div className="text-[11px] uppercase tracking-[0.22em] text-ink-faint">
        Players
      </div>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {sorted.map((p) => {
          const av = avatarFor(p.id, p.nickname, p.avatar, view.players);
          return (
            <li
              key={p.id}
              className="flex items-center gap-2 rounded-sm border border-line-soft bg-page/40 px-2 py-1.5"
            >
              <div
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${av.color} ${
                  av.isCustom
                    ? "border border-line text-xs"
                    : "text-[10px] font-semibold text-white"
                }`}
              >
                {av.initial}
              </div>
              <span className="min-w-0 flex-1 truncate text-xs text-ink">
                {p.nickname}
              </span>
              <span className="text-xs tabular-nums text-ink-soft">
                {p.score}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
