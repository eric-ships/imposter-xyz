// Wavelength game state. Lives in rooms.game_state jsonb when
// rooms.kind === 'wavelength'. Server-authoritative; clients see a
// (sometimes redacted) copy via PublicRoomView.gameState.
//
// Phases:
//   lobby     — pre-start, anyone can join
//   clue      — psychic picks a clue word; everyone else waits
//   guessing  — non-psychics place a guess on the dial; psychic waits
//   reveal    — target shown, scores updated, host advances to next
//   final     — all rounds done, final scoreboard, host can replay
export type WavelengthPhase =
  | "lobby"
  | "clue"
  | "guessing"
  | "reveal"
  | "final";

export type WavelengthGuess = {
  playerId: string;
  position: number; // 0-100
};

export type WavelengthState = {
  phase: WavelengthPhase;
  round: number; // 1-indexed
  totalRounds: number;
  // Rotation order set at match start. Each round's psychic is
  // psychicOrder[(round - 1) % psychicOrder.length].
  psychicOrder: string[];
  psychicId: string | null;
  concept: { left: string; right: string } | null;
  // Center of target band, 0-100. SERVER-ONLY during clue/guessing
  // phases — redacted to null in PublicRoomView for non-psychics so the
  // client can't peek by inspecting network responses.
  target: number | null;
  // Half-width of the bullseye band. Total band is target ± targetWidth.
  // Outer scoring bands extend ± (targetWidth * 2) for 3 points and
  // ± (targetWidth * 3) for 2 points.
  targetWidth: number;
  clue: string | null;
  guesses: WavelengthGuess[];
  // Cumulative scores across all rounds played in this match.
  scores: Record<string, number>;
  // Score deltas from the most recent round, cleared at next-round
  // advance. Drives the "+4" / "+2" badges in the reveal UI.
  roundScores: Record<string, number>;
  // ISO timestamp for the current phase's auto-advance deadline.
  // Set on entering clue / guessing phases; null in reveal/final/lobby
  // (those advance on host action, no clock pressure).
  deadline: string | null;
};

export const WAVELENGTH_DEFAULT_ROUNDS = 5;
export const WAVELENGTH_TARGET_WIDTH = 5; // bullseye is target ± 5 of 100

// Per-phase auto-advance durations. Picked to feel snappy without
// being punishing — psychic gets a generous minute to think of a
// clue, guessers get under a minute since they only need to drag a
// dial. Reveal + final wait on the host (no countdown).
export const WAVELENGTH_CLUE_MS = 60_000;
export const WAVELENGTH_GUESS_MS = 45_000;

// Default forfeit position when a guesser runs out the clock. Middle
// of the dial — neutral, not punishing-extra past missing the round.
export const WAVELENGTH_FORFEIT_POSITION = 50;
export const WAVELENGTH_FORFEIT_CLUE = "—";

export function deadlineFromNow(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

// Scoring bands (mirroring the physical game):
//   bullseye   (within 1× width):   4 points
//   inner      (within 2× width):   3 points
//   outer      (within 3× width):   2 points
//   miss:                           0 points
// The psychic earns the average of their guessers' band scores —
// rewards good clue-giving without making the psychic strictly better
// or worse than guessers.
export function scoreGuess(
  guess: number,
  target: number,
  width: number
): number {
  const distance = Math.abs(guess - target);
  if (distance <= width) return 4;
  if (distance <= width * 2) return 3;
  if (distance <= width * 3) return 2;
  return 0;
}
