// Pure state-transition helpers for Wavelength. These are called from
// the API routes; keeping them pure (no Supabase, no fetch) makes them
// easy to unit-test and reason about.
import { CONCEPT_PAIRS } from "./concepts";
import {
  WAVELENGTH_CLUE_MS,
  WAVELENGTH_DEFAULT_ROUNDS,
  WAVELENGTH_FORFEIT_CLUE,
  WAVELENGTH_FORFEIT_POSITION,
  WAVELENGTH_GUESS_MS,
  WAVELENGTH_TARGET_WIDTH,
  deadlineFromNow,
  scoreGuess,
  type WavelengthGuess,
  type WavelengthState,
} from "./types";

// Pick a concept pair, biased away from a list of recently-used ones.
// Mirrors the "avoid recent categories" logic from imposter's word
// generation so the same pair doesn't recur within a match.
export function pickConcept(avoid: { left: string; right: string }[] = []) {
  const avoidKeys = new Set(avoid.map((a) => `${a.left}|${a.right}`));
  const pool = CONCEPT_PAIRS.filter(
    (c) => !avoidKeys.has(`${c.left}|${c.right}`)
  );
  const src = pool.length > 0 ? pool : CONCEPT_PAIRS;
  return src[Math.floor(Math.random() * src.length)];
}

// Pick a target position 0-100. Avoids the very edges (0-5, 95-100) so
// the dial always has guessing room on both sides — pure-edge targets
// feel cheap.
export function pickTarget(): number {
  return Math.floor(Math.random() * 90) + 5; // 5..94 inclusive
}

// Initialize a fresh match. Sets up rotation, picks first round's
// concept + target. Caller already validated host + player count.
export function initMatch(
  playerIds: string[],
  totalRounds: number = WAVELENGTH_DEFAULT_ROUNDS
): WavelengthState {
  // Shuffle to randomize psychic order (Fisher-Yates).
  const order = [...playerIds];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const concept = pickConcept();
  const target = pickTarget();
  const scores: Record<string, number> = {};
  for (const id of playerIds) scores[id] = 0;
  return {
    phase: "clue",
    round: 1,
    totalRounds,
    psychicOrder: order,
    psychicId: order[0],
    concept,
    target,
    targetWidth: WAVELENGTH_TARGET_WIDTH,
    clue: null,
    guesses: [],
    scores,
    roundScores: {},
    deadline: deadlineFromNow(WAVELENGTH_CLUE_MS),
  };
}

// Apply the psychic's clue word; advance to guessing phase.
export function applyClue(
  prev: WavelengthState,
  word: string
): WavelengthState {
  return {
    ...prev,
    phase: "guessing",
    clue: word,
    deadline: deadlineFromNow(WAVELENGTH_GUESS_MS),
  };
}

// Append a guess. If everyone's guessed, score the round + advance to
// reveal phase. Caller must have validated:
//   - phase is 'guessing'
//   - guesser is not the psychic
//   - guesser hasn't already guessed this round
//   - position is 0-100
export function applyGuess(
  prev: WavelengthState,
  guesserIds: string[],
  guess: WavelengthGuess
): WavelengthState {
  const guesses = [...prev.guesses, guess];
  // Everyone-but-psychic must guess. Once we have all guesses, score.
  const expectedGuessers = guesserIds.filter(
    (id) => id !== prev.psychicId
  );
  const allIn = expectedGuessers.every((id) =>
    guesses.some((g) => g.playerId === id)
  );

  if (!allIn) {
    return { ...prev, guesses };
  }
  // Score the round.
  const target = prev.target ?? 50; // shouldn't be null here
  const roundScores: Record<string, number> = {};
  for (const g of guesses) {
    roundScores[g.playerId] = scoreGuess(
      g.position,
      target,
      prev.targetWidth
    );
  }
  // Psychic earns the MAX of guesser band-scores. Rewards connecting
  // with at least one teammate — the actual point of clue-giving —
  // without making the psychic strictly worse than guessers when one
  // teammate completely whiffs.
  if (prev.psychicId) {
    const max =
      guesses.length > 0
        ? Math.max(...guesses.map((g) => roundScores[g.playerId]))
        : 0;
    roundScores[prev.psychicId] = max;
  }
  // Unanimous bullseye bonus: if every guesser nails it, +2 to
  // everyone at the table (including the psychic). Rare, hype, gives
  // the table something to chase together.
  const allBullseye =
    guesses.length > 0 &&
    guesses.every((g) => roundScores[g.playerId] === 4);
  if (allBullseye) {
    for (const id of Object.keys(roundScores)) {
      roundScores[id] += 2;
    }
  }
  const nextScores = { ...prev.scores };
  for (const [id, pts] of Object.entries(roundScores)) {
    nextScores[id] = (nextScores[id] ?? 0) + pts;
  }
  return {
    ...prev,
    phase: "reveal",
    guesses,
    roundScores,
    scores: nextScores,
    // Reveal waits on host action — no clock.
    deadline: null,
  };
}

// Advance from reveal → next round (or → final if last round).
export function advanceRound(
  prev: WavelengthState,
  recentConcepts: { left: string; right: string }[] = []
): WavelengthState {
  if (prev.round >= prev.totalRounds) {
    return {
      ...prev,
      phase: "final",
      psychicId: null,
      concept: null,
      target: null,
      clue: null,
      guesses: [],
      roundScores: {},
      deadline: null,
    };
  }
  const nextRound = prev.round + 1;
  const psychicIdx = (nextRound - 1) % prev.psychicOrder.length;
  return {
    ...prev,
    phase: "clue",
    round: nextRound,
    psychicId: prev.psychicOrder[psychicIdx],
    concept: pickConcept(recentConcepts),
    target: pickTarget(),
    clue: null,
    guesses: [],
    roundScores: {},
    deadline: deadlineFromNow(WAVELENGTH_CLUE_MS),
  };
}

// Reset for "play again". Keeps the same player set + scores cleared.
export function replayMatch(
  playerIds: string[],
  totalRounds: number = WAVELENGTH_DEFAULT_ROUNDS
): WavelengthState {
  return initMatch(playerIds, totalRounds);
}

// Expire helper: forces the current phase to advance past its
// deadline. Idempotent — if the deadline isn't reached or the phase
// has already moved on, returns the state unchanged. Called by the
// /expire route, which any client can poke when their local
// countdown hits 0.
//
//   clue phase forfeit:    psychic stalled → use placeholder clue,
//                          advance to guessing with a fresh clock.
//   guessing phase forfeit: any non-guesser auto-submits the middle
//                          (50). The applyGuess auto-scoring kicks
//                          in once the last placeholder lands.
export function expireMatch(
  prev: WavelengthState,
  guesserIds: string[]
): WavelengthState {
  if (!prev.deadline) return prev;
  if (Date.now() < new Date(prev.deadline).getTime()) return prev;
  if (prev.phase === "clue") {
    return applyClue(prev, WAVELENGTH_FORFEIT_CLUE);
  }
  if (prev.phase === "guessing") {
    // Find missing guessers, auto-submit middle for each. Walk through
    // applyGuess so the round auto-scores when the last lands.
    let s = prev;
    const guessed = new Set(prev.guesses.map((g) => g.playerId));
    const missing = guesserIds.filter(
      (id) => id !== prev.psychicId && !guessed.has(id)
    );
    for (const id of missing) {
      s = applyGuess(s, guesserIds, {
        playerId: id,
        position: WAVELENGTH_FORFEIT_POSITION,
      });
    }
    return s;
  }
  return prev;
}

// View-side redaction: hide the target from non-psychic viewers during
// clue/guessing. Reveal/final phases expose everything (the target IS
// the reveal). Lobby has no target yet. Called from room-state.ts.
export function redactForViewer(
  state: WavelengthState,
  viewerId: string | null
): WavelengthState {
  const targetVisible =
    state.phase === "reveal" ||
    state.phase === "final" ||
    state.phase === "lobby" ||
    (viewerId !== null && state.psychicId === viewerId);
  if (targetVisible) return state;
  return { ...state, target: null };
}
