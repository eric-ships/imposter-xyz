import type { GuessOutcome } from "@/lib/game";

// Persisted snapshot of one completed match. Stored as a JSON object
// inside rooms.match_history (jsonb array). Captures both the raw facts
// (category, secret, imposter ids, guess, outcome) and derived rollups
// (winner, per-player delta) so the lobby panel can render quickly
// without re-deriving and so historical entries stay correct even if
// scoring rules change later.
//
// Nickname + avatar are snapshotted at match-end time so leavers /
// renamers don't break the historical entry.
export type MatchSide = "imposter" | "crewmates" | "draw";

export type MatchHistoryEntry = {
  matchNumber: number;
  endedAt: string; // ISO timestamp
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
}): MatchHistoryEntry {
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
