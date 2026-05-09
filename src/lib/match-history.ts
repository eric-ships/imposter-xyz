import type { GuessOutcome } from "@/lib/game";

// Persisted snapshot of one completed match. Stored as a JSON object
// inside rooms.match_history (jsonb array). Multi-game capable via a
// `kind` discriminator: imposter and wavelength have very different
// per-match facts, so they're separate variants of a discriminated
// union rather than one fat shape with mostly-null fields.
//
// Nickname + avatar are snapshotted at match-end so leavers/renamers
// don't break the historical entry.

export type MatchSide = "imposter" | "crewmates" | "draw";

// Pre-multi-game entries lacked `kind`. Treat them as imposter for
// backward compatibility — that's what they all were.
export type ImposterMatchEntry = {
  kind?: "imposter";
  matchNumber: number;
  endedAt: string;
  category: string;
  secretWord: string;
  imposterIds: string[];
  caughtImposterId: string | null;
  guess: string | null;
  guessOutcome: GuessOutcome | null;
  winner: MatchSide;
  perPlayer: Array<{
    playerId: string;
    nickname: string;
    avatar: string | null;
    wasImposter: boolean;
    delta: number;
  }>;
};

export type WavelengthMatchEntry = {
  kind: "wavelength";
  matchNumber: number;
  endedAt: string;
  totalRounds: number;
  // Snapshot of the final scoreboard. Sorted on read by score desc.
  perPlayer: Array<{
    playerId: string;
    nickname: string;
    avatar: string | null;
    score: number;
  }>;
  // Player ids of the top scorer(s). Length > 1 means a tie.
  winnerIds: string[];
  // Top score reached.
  topScore: number;
};

export type JustOneMatchEntry = {
  kind: "just-one";
  matchNumber: number;
  endedAt: string;
  totalCards: number;
  score: number; // correct guesses
  rating: string; // human label ("Telepathic", "Sharp", etc.)
};

export type MatchHistoryEntry =
  | ImposterMatchEntry
  | WavelengthMatchEntry
  | JustOneMatchEntry;

// Cap so a single lobby can't accumulate unbounded history. Lobbies are
// short-lived, so 20 covers a long evening with headroom.
export const MATCH_HISTORY_CAP = 20;

// Mirror of the scoring formula in vote/route.ts and guess/route.ts —
// keep these in lockstep when scoring rules change.
//   imposters escape (no catch):    imp +2, crew +0
//   caught + exact guess:           imp +2, crew +0
//   caught + close guess:           everyone +1
//   caught + wrong guess:           imp +0, crew +1
function deriveDelta(
  wasImposter: boolean,
  caught: boolean,
  outcome: GuessOutcome | null
): number {
  if (!caught) return wasImposter ? 2 : 0;
  if (outcome === "exact") return wasImposter ? 2 : 0;
  if (outcome === "close") return 1;
  // wrong / null
  return wasImposter ? 0 : 1;
}

function deriveWinner(caught: boolean, outcome: GuessOutcome | null): MatchSide {
  if (!caught) return "imposter";
  if (outcome === "exact") return "imposter";
  if (outcome === "close") return "draw";
  return "crewmates";
}

export function snapshotMatch(args: {
  matchNumber: number;
  category: string;
  secretWord: string;
  imposterIds: string[];
  caughtImposterId: string | null;
  guess: string | null;
  guessOutcome: GuessOutcome | null;
  players: Array<{ id: string; nickname: string; avatar: string | null }>;
}): ImposterMatchEntry {
  const caught = !!args.guessOutcome;
  const winner = deriveWinner(caught, args.guessOutcome);
  const imposterSet = new Set(args.imposterIds);

  const perPlayer = args.players.map((p) => {
    const wasImposter = imposterSet.has(p.id);
    return {
      playerId: p.id,
      nickname: p.nickname,
      avatar: p.avatar,
      wasImposter,
      delta: deriveDelta(wasImposter, caught, args.guessOutcome),
    };
  });

  return {
    kind: "imposter",
    matchNumber: args.matchNumber,
    endedAt: new Date().toISOString(),
    category: args.category,
    secretWord: args.secretWord,
    imposterIds: args.imposterIds,
    caughtImposterId: args.caughtImposterId,
    guess: args.guess,
    guessOutcome: args.guessOutcome,
    winner,
    perPlayer,
  };
}

// Just-One-side snapshot. Called from the next-card route when the
// host transitions from final → replay. Captures the final score and
// a human rating label.
export function snapshotJustOneMatch(args: {
  matchNumber: number;
  totalCards: number;
  score: number;
}): JustOneMatchEntry {
  const ratio = args.totalCards > 0 ? args.score / args.totalCards : 0;
  const rating =
    ratio >= 0.85
      ? "Telepathic"
      : ratio >= 0.6
        ? "Sharp"
        : ratio >= 0.35
          ? "Solid"
          : ratio >= 0.15
            ? "Warming up"
            : "Tough deck";
  return {
    kind: "just-one",
    matchNumber: args.matchNumber,
    endedAt: new Date().toISOString(),
    totalCards: args.totalCards,
    score: args.score,
    rating,
  };
}

// Wavelength-side snapshot. Called from the next-round route when the
// host transitions from final → replay. Captures the final scoreboard
// and winner(s).
export function snapshotWavelengthMatch(args: {
  matchNumber: number;
  totalRounds: number;
  scores: Record<string, number>;
  players: Array<{ id: string; nickname: string; avatar: string | null }>;
}): WavelengthMatchEntry {
  const perPlayer = args.players.map((p) => ({
    playerId: p.id,
    nickname: p.nickname,
    avatar: p.avatar,
    score: args.scores[p.id] ?? 0,
  }));
  const topScore = perPlayer.reduce(
    (max, p) => Math.max(max, p.score),
    0
  );
  const winnerIds = perPlayer
    .filter((p) => p.score === topScore)
    .map((p) => p.playerId);
  return {
    kind: "wavelength",
    matchNumber: args.matchNumber,
    endedAt: new Date().toISOString(),
    totalRounds: args.totalRounds,
    perPlayer,
    winnerIds,
    topScore,
  };
}
