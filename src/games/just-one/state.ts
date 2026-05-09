// Pure state-transition helpers for Just One. Mirrors the wavelength
// state.ts pattern: pure functions, no Supabase, easy to unit-test.
import { JUST_ONE_WORDS } from "./words";
import {
  JUST_ONE_CLUE_MS,
  JUST_ONE_GUESS_MS,
  computeEliminations,
  deadlineFromNow,
  normalizeClue,
  totalCardsFor,
  type JustOneCardOutcome,
  type JustOneClue,
  type JustOneOutcome,
  type JustOneState,
} from "./types";

// Pick a fresh secret word, biased away from a recent-words list so a
// match doesn't repeat the same word across cards. Falls back to the
// full pool if recent contains the entire pool (shouldn't happen in
// practice — pool is large).
function pickSecret(avoid: string[] = []): string {
  const avoidSet = new Set(avoid.map((w) => w.toLowerCase()));
  const pool = JUST_ONE_WORDS.filter(
    (w) => !avoidSet.has(w.toLowerCase())
  );
  const src = pool.length > 0 ? pool : JUST_ONE_WORDS;
  return src[Math.floor(Math.random() * src.length)];
}

export function initMatch(playerIds: string[]): JustOneState {
  // Shuffle so guesser order isn't always join order.
  const order = [...playerIds];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const totalCards = totalCardsFor(playerIds.length);
  const secretWord = pickSecret();
  return {
    phase: "clue",
    cardIndex: 0,
    totalCards,
    guesserOrder: order,
    guesserId: order[0],
    secretWord,
    clues: [],
    eliminatedPlayerIds: [],
    guess: null,
    outcome: null,
    score: 0,
    history: [],
    recentWords: [secretWord],
    deadline: deadlineFromNow(JUST_ONE_CLUE_MS),
  };
}

// Append/replace a player's clue. Same player submitting twice
// overwrites their prior entry (until the phase advances). When the
// last non-guesser clue lands, advance to guess phase + compute
// eliminations.
export function applyClue(
  prev: JustOneState,
  clueGiverIds: string[],
  clue: JustOneClue
): JustOneState {
  const otherClues = prev.clues.filter(
    (c) => c.playerId !== clue.playerId
  );
  const clues = [...otherClues, clue];

  // Are all expected clue-givers in?
  const expected = clueGiverIds.filter((id) => id !== prev.guesserId);
  const allIn =
    expected.length > 0 &&
    expected.every((id) => clues.some((c) => c.playerId === id));

  if (!allIn) {
    return { ...prev, clues };
  }

  // Compute eliminations + advance to guess phase.
  const eliminated = computeEliminations(clues, prev.secretWord ?? "");
  return {
    ...prev,
    phase: "guess",
    clues,
    eliminatedPlayerIds: Array.from(eliminated),
    deadline: deadlineFromNow(JUST_ONE_GUESS_MS),
  };
}

// Apply the guesser's guess: judge correct vs wrong (case-insensitive
// + normalized stem match), advance to reveal.
export function applyGuess(
  prev: JustOneState,
  guess: string
): JustOneState {
  const trimmed = guess.trim();
  const correct =
    !!prev.secretWord &&
    normalizeClue(trimmed) === normalizeClue(prev.secretWord);
  const outcome: JustOneOutcome = correct ? "correct" : "wrong";
  return {
    ...prev,
    phase: "reveal",
    guess: trimmed,
    outcome,
    score: prev.score + (correct ? 1 : 0),
    deadline: null,
  };
}

// Skip the current card without guessing. Doesn't count as correct;
// counts as the card being played (advances toward totalCards).
export function applySkip(prev: JustOneState): JustOneState {
  return {
    ...prev,
    phase: "reveal",
    outcome: "skipped",
    deadline: null,
  };
}

// Advance reveal → next card (or → final if last card). Snapshots the
// just-finished card into history.
export function advanceCard(prev: JustOneState): JustOneState {
  // Snapshot: which clues were eliminated, what was guessed.
  const eliminatedSet = new Set(prev.eliminatedPlayerIds);
  const cardOutcome: JustOneCardOutcome = {
    cardIndex: prev.cardIndex,
    guesserId: prev.guesserId ?? "",
    secretWord: prev.secretWord ?? "",
    clues: prev.clues.map((c) => ({
      playerId: c.playerId,
      word: c.word,
      eliminated: eliminatedSet.has(c.playerId),
    })),
    guess: prev.guess,
    outcome: prev.outcome ?? "skipped",
  };
  const nextHistory = [...prev.history, cardOutcome];

  if (prev.cardIndex + 1 >= prev.totalCards) {
    return {
      ...prev,
      phase: "final",
      history: nextHistory,
      guesserId: null,
      secretWord: null,
      clues: [],
      eliminatedPlayerIds: [],
      guess: null,
      outcome: null,
      deadline: null,
    };
  }

  const nextIndex = prev.cardIndex + 1;
  const guesserIdx = nextIndex % prev.guesserOrder.length;
  const nextRecent = [...prev.recentWords].slice(-30);
  const secret = pickSecret(nextRecent);
  return {
    ...prev,
    phase: "clue",
    cardIndex: nextIndex,
    guesserId: prev.guesserOrder[guesserIdx],
    secretWord: secret,
    clues: [],
    eliminatedPlayerIds: [],
    guess: null,
    outcome: null,
    history: nextHistory,
    recentWords: [...nextRecent, secret],
    deadline: deadlineFromNow(JUST_ONE_CLUE_MS),
  };
}

export function replayMatch(playerIds: string[]): JustOneState {
  return initMatch(playerIds);
}

// Idempotent expire: only fires past the deadline. Forfeit semantics:
//   clue → any non-clue-giver is treated as forfeit (their clue
//          slot stays empty; eliminations include them). Advance to
//          guess.
//   guess → no guess submitted = wrong. Advance to reveal.
export function expireMatch(
  prev: JustOneState,
  clueGiverIds: string[]
): JustOneState {
  if (!prev.deadline) return prev;
  if (Date.now() < new Date(prev.deadline).getTime()) return prev;
  if (prev.phase === "clue") {
    // Force-advance to guess with whatever clues are in. Players
    // who didn't submit just have no clue (they're not in `clues`).
    const eliminated = computeEliminations(
      prev.clues,
      prev.secretWord ?? ""
    );
    return {
      ...prev,
      phase: "guess",
      eliminatedPlayerIds: Array.from(eliminated),
      deadline: deadlineFromNow(JUST_ONE_GUESS_MS),
    };
  }
  if (prev.phase === "guess") {
    return {
      ...prev,
      phase: "reveal",
      guess: null,
      outcome: "wrong",
      deadline: null,
    };
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _unused = clueGiverIds; // present for parity with wavelength
  return prev;
}

// View-side redaction: hide the secret from the guesser during clue
// and guess phases. During clue phase, also hide other players'
// clues (so people don't peek). Reveal/final phase exposes
// everything.
export function redactForViewer(
  state: JustOneState,
  viewerId: string | null
): JustOneState {
  const exposeAll =
    state.phase === "reveal" ||
    state.phase === "final" ||
    state.phase === "lobby";
  if (exposeAll) return state;

  const isGuesser = viewerId !== null && viewerId === state.guesserId;
  let next: JustOneState = state;

  // Guesser doesn't see the secret until reveal.
  if (isGuesser) {
    next = { ...next, secretWord: null };
  }

  // Clue phase: each viewer sees only their own clue. Guess phase:
  // guesser sees only the surviving (non-eliminated) clues, with the
  // author redacted to hide who wrote what; non-guessers see all
  // clues + their own elimination status.
  if (next.phase === "clue") {
    next = {
      ...next,
      clues: next.clues.filter((c) => c.playerId === viewerId),
    };
  } else if (next.phase === "guess") {
    if (isGuesser) {
      const elim = new Set(next.eliminatedPlayerIds);
      next = {
        ...next,
        clues: next.clues
          .filter((c) => !elim.has(c.playerId))
          // Anonymize so the guesser can't infer "I trust X" attacks.
          .map((c) => ({ ...c, playerId: "" })),
        // Hide elimination metadata from the guesser.
        eliminatedPlayerIds: [],
      };
    }
  }

  return next;
}
