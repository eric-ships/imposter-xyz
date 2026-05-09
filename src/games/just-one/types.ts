// Just One game state. Lives in rooms.game_state jsonb when
// rooms.kind === 'just-one'. Server-authoritative; clients see a
// per-viewer redacted copy via PublicRoomView.gameState.
//
// Phases:
//   lobby   — pre-start, host can begin if ≥3 players
//   clue    — non-guessers privately write a one-word clue; guesser
//              waits ("X people writing clues for you...")
//   guess   — guesser sees the surviving (non-duplicate) clues and
//              types a single guess
//   reveal  — secret + every clue (with elimination status) + outcome
//              shown; host advances to next card
//   final   — all cards played, full match scoreboard, host can replay
export type JustOnePhase =
  | "lobby"
  | "clue"
  | "guess"
  | "reveal"
  | "final";

export type JustOneClue = {
  playerId: string;
  word: string; // raw entry preserved for the reveal display
};

export type JustOneOutcome = "correct" | "wrong" | "skipped";

export type JustOneCardOutcome = {
  cardIndex: number;
  guesserId: string;
  secretWord: string;
  // Each clue with the elimination flag computed at clue-phase end.
  clues: { playerId: string; word: string; eliminated: boolean }[];
  guess: string | null;
  outcome: JustOneOutcome;
};

export type JustOneState = {
  phase: JustOnePhase;
  cardIndex: number; // 0-indexed
  totalCards: number;
  // Rotation order set at match start. Each card's guesser is
  // guesserOrder[cardIndex % guesserOrder.length].
  guesserOrder: string[];
  guesserId: string | null;
  // The target word for the current card. SERVER-ONLY during clue
  // and guess phases for the guesser (redacted in the view payload).
  // Visible to non-guessers + everyone at reveal.
  secretWord: string | null;
  clues: JustOneClue[];
  // Player ids whose clues were eliminated (duplicates or matched the
  // secret). Computed at clue → guess transition. Empty during clue
  // phase.
  eliminatedPlayerIds: string[];
  guess: string | null;
  outcome: JustOneOutcome | null;
  // Cumulative correct count across the match so far.
  score: number;
  // Snapshot of every card already finished. Drives the reveal
  // history line + the lobby match-history snapshot.
  history: JustOneCardOutcome[];
  // Word-pool dedupe so the same secret doesn't repeat in a match.
  recentWords: string[];
  // Per-phase deadline (ISO). Set on entering clue + guess, null in
  // reveal/final/lobby (those wait on host action).
  deadline: string | null;
};

// Per-phase auto-advance durations. Picked to feel snappy but humane.
export const JUST_ONE_CLUE_MS = 60_000;
export const JUST_ONE_GUESS_MS = 45_000;

// Default per-card schedule: 2 cards per player. Mirrors wavelength's
// "2 rounds per player" so both games scale predictably with table
// size and every player gets a fair share of guesser turns.
export function totalCardsFor(playerCount: number): number {
  return Math.max(2, playerCount * 2);
}

export function deadlineFromNow(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

// Normalize a clue (or the secret) for duplicate detection.
// Lowercase, strip punctuation, light stemming so common variations
// (Banana / bananas, jump / jumping) collapse to the same key.
//
// Light, not perfect — covers the common cases without pulling a
// stemming library. The spirit of the Just One rule is that obvious
// variants count as the same clue.
export function normalizeClue(raw: string): string {
  let w = raw.trim().toLowerCase();
  w = w.replace(/[^a-z0-9]/g, "");
  if (w.length >= 4) {
    if (w.endsWith("ies") && w.length >= 5) w = w.slice(0, -3) + "y";
    else if (w.endsWith("es") && w.length >= 5) w = w.slice(0, -2);
    else if (
      w.endsWith("s") &&
      !w.endsWith("ss") &&
      !w.endsWith("us") &&
      w.length >= 4
    )
      w = w.slice(0, -1);
    if (w.endsWith("ing") && w.length >= 5) w = w.slice(0, -3);
    else if (w.endsWith("ed") && w.length >= 4) w = w.slice(0, -2);
  }
  return w;
}

// Returns the set of player ids whose clues are eliminated:
//   - any clue whose normalized form matches another player's
//   - any clue that matches (normalized) the secret word
export function computeEliminations(
  clues: JustOneClue[],
  secretWord: string
): Set<string> {
  const secretKey = normalizeClue(secretWord);
  const counts = new Map<string, number>();
  const keyByPlayer = new Map<string, string>();
  for (const c of clues) {
    const key = normalizeClue(c.word);
    keyByPlayer.set(c.playerId, key);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const eliminated = new Set<string>();
  for (const [pid, key] of keyByPlayer.entries()) {
    if (key === "" || key === secretKey || (counts.get(key) ?? 0) > 1) {
      eliminated.add(pid);
    }
  }
  return eliminated;
}
