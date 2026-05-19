// Hardcoded, seeded mock state for the static /preview pages.
//
// These pages render the real in-game UI components fed with
// believable mid-game data so the team can eyeball each game's look
// without spinning up a live multiplayer room. Nothing here touches
// the server or realtime — every value below is a literal.
//
// The imposter game keeps its state in dedicated PublicRoomView
// columns; the other four games stash a per-kind blob in
// `gameState`. Builders below assemble both shapes.

import type { GameKind, Player, PublicRoomView } from "@/lib/game";

// ─── Seed roster ───────────────────────────────────────────────────

// A coherent six-person table. Ids are stable strings so every
// builder can reference the same players. `you` in each preview is
// Eric, so the viewer sees the table from one consistent seat.
export const SEED_PLAYER_IDS = {
  alice: "p-alice",
  eric: "p-eric",
  mara: "p-mara",
  jonas: "p-jonas",
  priya: "p-priya",
  theo: "p-theo",
} as const;

export const VIEWER_ID = SEED_PLAYER_IDS.eric;

type SeedPlayer = { id: string; nickname: string; avatar: string | null };

const SEED_ROSTER: SeedPlayer[] = [
  { id: SEED_PLAYER_IDS.alice, nickname: "Alice", avatar: null },
  { id: SEED_PLAYER_IDS.eric, nickname: "Eric", avatar: null },
  { id: SEED_PLAYER_IDS.mara, nickname: "Mara", avatar: "🦊" },
  { id: SEED_PLAYER_IDS.jonas, nickname: "Jonas", avatar: null },
  { id: SEED_PLAYER_IDS.priya, nickname: "Priya", avatar: "🌶️" },
  { id: SEED_PLAYER_IDS.theo, nickname: "Theo", avatar: null },
];

// Build the Player[] for a room of the first `count` seed players,
// with optional per-player score overrides.
function roster(
  count: number,
  scores: Record<string, number> = {}
): Player[] {
  return SEED_ROSTER.slice(0, count).map((p) => ({
    id: p.id,
    userId: null,
    nickname: p.nickname,
    score: scores[p.id] ?? 0,
    avatar: p.avatar,
    walletAddress: null,
    hasPermission: false,
    antePaid: false,
    anteTx: null,
  }));
}

// A PublicRoomView with every field at a sane default. Individual
// builders spread over this and override only what matters for the
// phase they're showing.
function baseView(kind: GameKind, players: Player[]): PublicRoomView {
  return {
    code: "PREVUE",
    hostId: SEED_PLAYER_IDS.alice,
    kind,
    gameState: {},
    groupId: null,
    groupName: null,
    groupInviteCode: null,
    state: "playing",
    category: null,
    round: 1,
    totalRounds: 3,
    turnIndex: 0,
    turnOrder: players.map((p) => p.id),
    phaseDeadline: null,
    caughtImposterId: null,
    players,
    clues: [],
    votes: [],
    pot: null,
    payouts: [],
    guessCandidates: [],
    showCandidatesAlways: false,
    you: null,
    skipVotes: [],
    moleMode: false,
    jesusMode: false,
    policeMode: false,
    streamerMode: false,
    reveal: null,
    matchHistory: [],
  };
}

// A deadline a fixed distance in the future. The countdown pills
// re-render off this; a static page just shows a frozen-ish clock.
function futureDeadline(secondsAhead: number): string {
  return new Date(Date.now() + secondsAhead * 1000).toISOString();
}

// ─── Imposter ──────────────────────────────────────────────────────

const IMPOSTER_PLAYERS = roster(5, {
  [SEED_PLAYER_IDS.alice]: 3,
  [SEED_PLAYER_IDS.eric]: 2,
  [SEED_PLAYER_IDS.mara]: 4,
  [SEED_PLAYER_IDS.jonas]: 1,
  [SEED_PLAYER_IDS.priya]: 2,
});

// Round 2 of a "Breakfast foods" match. Secret word is "Pancakes";
// Jonas is the imposter. Eric (the viewer) is an honest crewmate.
export function imposterPlayingView(): PublicRoomView {
  const base = baseView("imposter", IMPOSTER_PLAYERS);
  return {
    ...base,
    state: "playing",
    category: "Breakfast foods",
    round: 2,
    totalRounds: 3,
    turnIndex: 3,
    phaseDeadline: futureDeadline(38),
    clues: [
      reactedClue(1, 1, SEED_PLAYER_IDS.alice, "syrup", [
        { emoji: "🔥", reactors: ["Mara", "Theo"] },
      ]),
      reactedClue(2, 1, SEED_PLAYER_IDS.eric, "stack", []),
      reactedClue(3, 1, SEED_PLAYER_IDS.mara, "fluffy", [
        { emoji: "😂", reactors: ["Jonas"] },
      ]),
      reactedClue(4, 1, SEED_PLAYER_IDS.jonas, "round", [
        { emoji: "🤔", reactors: ["Alice", "Eric"] },
      ]),
      reactedClue(5, 1, SEED_PLAYER_IDS.priya, "griddle", []),
      reactedClue(6, 2, SEED_PLAYER_IDS.alice, "weekend", []),
      reactedClue(7, 2, SEED_PLAYER_IDS.eric, "butter", [
        { emoji: "🔥", reactors: ["Mara"] },
      ]),
      reactedClue(8, 2, SEED_PLAYER_IDS.mara, "flip", []),
    ],
    you: {
      id: VIEWER_ID,
      isHost: false,
      isImposter: false,
      isCaughtImposter: false,
      secretWord: "Pancakes",
      teammateIds: [],
      partnerId: null,
      isPolice: false,
      investigation: null,
      squadStanding: null,
    },
  };
}

// The vote phase of the same match — three votes already in, the
// table closing in on Jonas.
export function imposterVotingView(): PublicRoomView {
  const playing = imposterPlayingView();
  return {
    ...playing,
    state: "voting",
    phaseDeadline: futureDeadline(22),
    votes: [
      { voter_id: SEED_PLAYER_IDS.alice, target_id: SEED_PLAYER_IDS.jonas },
      { voter_id: SEED_PLAYER_IDS.mara, target_id: SEED_PLAYER_IDS.jonas },
      { voter_id: SEED_PLAYER_IDS.priya, target_id: SEED_PLAYER_IDS.eric },
    ],
  };
}

// The reveal — the crew caught Jonas, his last-ditch guess was wrong,
// crewmates take the round.
export function imposterRevealView(): PublicRoomView {
  const playing = imposterPlayingView();
  return {
    ...playing,
    state: "reveal",
    caughtImposterId: SEED_PLAYER_IDS.jonas,
    guessCandidates: ["Waffles", "Pancakes", "Omelette", "Toast", "Cereal"],
    reveal: {
      imposterIds: [SEED_PLAYER_IDS.jonas],
      secretWord: "Pancakes",
      caught: true,
      caughtImposterId: SEED_PLAYER_IDS.jonas,
      guess: "Waffles",
      guessOutcome: "wrong",
    },
  };
}

function reactedClue(
  id: number,
  round: number,
  playerId: string,
  word: string,
  reactions: { emoji: string; reactors: string[] }[]
) {
  return {
    id,
    player_id: playerId,
    round,
    word,
    reactions: reactions.map((r) => ({
      emoji: r.emoji,
      count: r.reactors.length,
      mine: false,
      reactors: r.reactors,
    })),
  };
}

// ─── Wavelength ────────────────────────────────────────────────────

const WAVELENGTH_PLAYERS = roster(5);

const WAVELENGTH_SCORES: Record<string, number> = {
  [SEED_PLAYER_IDS.alice]: 11,
  [SEED_PLAYER_IDS.eric]: 14,
  [SEED_PLAYER_IDS.mara]: 9,
  [SEED_PLAYER_IDS.jonas]: 13,
  [SEED_PLAYER_IDS.priya]: 8,
};

// Round 3 of 5, guessing phase: Mara is the psychic, clue "Lukewarm"
// on the Cold ↔ Hot spectrum, two guesses already locked.
export function wavelengthGuessingView(): PublicRoomView {
  const base = baseView("wavelength", WAVELENGTH_PLAYERS);
  return {
    ...base,
    state: "playing",
    gameState: {
      phase: "guessing",
      round: 3,
      totalRounds: 5,
      psychicOrder: WAVELENGTH_PLAYERS.map((p) => p.id),
      psychicId: SEED_PLAYER_IDS.mara,
      concept: { left: "Cold", right: "Hot" },
      target: null,
      targetWidth: 5,
      clue: "Lukewarm",
      guesses: [
        { playerId: SEED_PLAYER_IDS.alice, position: 54 },
        { playerId: SEED_PLAYER_IDS.jonas, position: 47 },
      ],
      scores: WAVELENGTH_SCORES,
      roundScores: {},
      deadline: futureDeadline(31),
    },
  };
}

// The reveal of that round — target was 52, the table clustered
// nicely around the clue.
export function wavelengthRevealView(): PublicRoomView {
  const base = baseView("wavelength", WAVELENGTH_PLAYERS);
  return {
    ...base,
    state: "playing",
    gameState: {
      phase: "reveal",
      round: 3,
      totalRounds: 5,
      psychicOrder: WAVELENGTH_PLAYERS.map((p) => p.id),
      psychicId: SEED_PLAYER_IDS.mara,
      concept: { left: "Cold", right: "Hot" },
      target: 52,
      targetWidth: 5,
      clue: "Lukewarm",
      guesses: [
        { playerId: SEED_PLAYER_IDS.alice, position: 54 },
        { playerId: SEED_PLAYER_IDS.eric, position: 49 },
        { playerId: SEED_PLAYER_IDS.jonas, position: 47 },
        { playerId: SEED_PLAYER_IDS.priya, position: 63 },
      ],
      scores: {
        [SEED_PLAYER_IDS.alice]: 15,
        [SEED_PLAYER_IDS.eric]: 18,
        [SEED_PLAYER_IDS.mara]: 12,
        [SEED_PLAYER_IDS.jonas]: 17,
        [SEED_PLAYER_IDS.priya]: 10,
      },
      roundScores: {
        [SEED_PLAYER_IDS.alice]: 4,
        [SEED_PLAYER_IDS.eric]: 4,
        [SEED_PLAYER_IDS.jonas]: 4,
        [SEED_PLAYER_IDS.priya]: 2,
        [SEED_PLAYER_IDS.mara]: 3,
      },
      deadline: null,
    },
  };
}

// ─── Just One ──────────────────────────────────────────────────────

const JUST_ONE_PLAYERS = roster(5);

// Card 4 of 10, reveal phase: secret "Volcano", Priya guessed it
// right. Two clues collided ("lava") and were eliminated.
export function justOneRevealView(): PublicRoomView {
  const base = baseView("just-one", JUST_ONE_PLAYERS);
  const clues = [
    { playerId: SEED_PLAYER_IDS.alice, word: "lava" },
    { playerId: SEED_PLAYER_IDS.eric, word: "eruption" },
    { playerId: SEED_PLAYER_IDS.mara, word: "lava" },
    { playerId: SEED_PLAYER_IDS.jonas, word: "mountain" },
  ];
  return {
    ...base,
    state: "playing",
    gameState: {
      phase: "reveal",
      cardIndex: 3,
      totalCards: 10,
      guesserOrder: JUST_ONE_PLAYERS.map((p) => p.id),
      guesserId: SEED_PLAYER_IDS.priya,
      secretWord: "Volcano",
      clues,
      eliminatedPlayerIds: [SEED_PLAYER_IDS.alice, SEED_PLAYER_IDS.mara],
      guess: "Volcano",
      outcome: "correct",
      score: 3,
      history: [
        justOneCard(0, SEED_PLAYER_IDS.alice, "Lighthouse", "correct"),
        justOneCard(1, SEED_PLAYER_IDS.eric, "Cactus", "wrong"),
        justOneCard(2, SEED_PLAYER_IDS.mara, "Trumpet", "correct"),
      ],
      recentWords: ["Lighthouse", "Cactus", "Trumpet", "Volcano"],
      deadline: null,
    },
  };
}

// Card 5 of 10, clue phase from a clue-giver's seat (Eric writes,
// Theo is the guesser).
export function justOneClueView(): PublicRoomView {
  const base = baseView("just-one", JUST_ONE_PLAYERS);
  return {
    ...base,
    state: "playing",
    gameState: {
      phase: "clue",
      cardIndex: 4,
      totalCards: 10,
      guesserOrder: JUST_ONE_PLAYERS.map((p) => p.id),
      guesserId: SEED_PLAYER_IDS.priya,
      secretWord: "Compass",
      clues: [
        { playerId: SEED_PLAYER_IDS.alice, word: "north" },
        { playerId: SEED_PLAYER_IDS.mara, word: "needle" },
      ],
      eliminatedPlayerIds: [],
      guess: null,
      outcome: null,
      score: 3,
      history: [
        justOneCard(0, SEED_PLAYER_IDS.alice, "Lighthouse", "correct"),
        justOneCard(1, SEED_PLAYER_IDS.eric, "Cactus", "wrong"),
        justOneCard(2, SEED_PLAYER_IDS.mara, "Trumpet", "correct"),
        justOneCard(3, SEED_PLAYER_IDS.priya, "Volcano", "correct"),
      ],
      recentWords: ["Lighthouse", "Cactus", "Trumpet", "Volcano", "Compass"],
      deadline: futureDeadline(44),
    },
  };
}

function justOneCard(
  cardIndex: number,
  guesserId: string,
  secretWord: string,
  outcome: "correct" | "wrong" | "skipped"
) {
  return {
    cardIndex,
    guesserId,
    secretWord,
    clues: [],
    guess: outcome === "skipped" ? null : secretWord,
    outcome,
  };
}

// ─── Crew ──────────────────────────────────────────────────────────

const CREW_PLAYERS = roster(4);

// A mid-mission Crew board: trick 3 of 10, two cards on the table,
// one task already done, signals out.
export function crewPlayView(): PublicRoomView {
  const base = baseView("crew", CREW_PLAYERS);
  const order = CREW_PLAYERS.map((p) => p.id);
  return {
    ...base,
    state: "playing",
    gameState: {
      phase: "play",
      hands: {
        [SEED_PLAYER_IDS.alice]: [],
        [SEED_PLAYER_IDS.eric]: [
          { suit: "blue", rank: 2 },
          { suit: "blue", rank: 7 },
          { suit: "green", rank: 4 },
          { suit: "pink", rank: 9 },
          { suit: "yellow", rank: 1 },
          { suit: "yellow", rank: 6 },
          { suit: "rocket", rank: 2 },
        ],
        [SEED_PLAYER_IDS.mara]: [],
        [SEED_PLAYER_IDS.jonas]: [],
      },
      handSizes: {
        [SEED_PLAYER_IDS.alice]: 7,
        [SEED_PLAYER_IDS.eric]: 7,
        [SEED_PLAYER_IDS.mara]: 8,
        [SEED_PLAYER_IDS.jonas]: 8,
      },
      tasks: [
        {
          card: { suit: "pink", rank: 9 },
          ownerId: SEED_PLAYER_IDS.eric,
          done: false,
          failed: false,
        },
        {
          card: { suit: "green", rank: 3 },
          ownerId: SEED_PLAYER_IDS.alice,
          done: true,
          failed: false,
        },
        {
          card: { suit: "yellow", rank: 8 },
          ownerId: SEED_PLAYER_IDS.mara,
          done: false,
          failed: false,
        },
        {
          card: { suit: "blue", rank: 5 },
          ownerId: SEED_PLAYER_IDS.jonas,
          done: false,
          failed: false,
        },
      ],
      order,
      leaderId: SEED_PLAYER_IDS.mara,
      turnId: SEED_PLAYER_IDS.eric,
      currentTrick: [
        {
          playerId: SEED_PLAYER_IDS.mara,
          card: { suit: "blue", rank: 4 },
        },
        {
          playerId: SEED_PLAYER_IDS.jonas,
          card: { suit: "blue", rank: 8 },
        },
      ],
      trickNumber: 2,
      totalTricks: 10,
      lastTrick: {
        plays: [
          {
            playerId: SEED_PLAYER_IDS.alice,
            card: { suit: "green", rank: 3 },
          },
        ],
        winnerId: SEED_PLAYER_IDS.alice,
      },
      communications: {
        [SEED_PLAYER_IDS.alice]: null,
        [SEED_PLAYER_IDS.eric]: null,
        [SEED_PLAYER_IDS.mara]: {
          card: { suit: "green", rank: 9 },
          kind: "highest",
        },
        [SEED_PLAYER_IDS.jonas]: {
          card: { suit: "yellow", rank: 1 },
          kind: "lowest",
        },
      },
      outcome: null,
      resultDetail: null,
      deadline: futureDeadline(68),
    },
  };
}

// The reveal of a won mission.
export function crewRevealView(): PublicRoomView {
  const play = crewPlayView();
  const state = play.gameState as Record<string, unknown>;
  return {
    ...play,
    gameState: {
      ...state,
      phase: "reveal",
      currentTrick: [],
      trickNumber: 10,
      tasks: [
        {
          card: { suit: "pink", rank: 9 },
          ownerId: SEED_PLAYER_IDS.eric,
          done: true,
          failed: false,
        },
        {
          card: { suit: "green", rank: 3 },
          ownerId: SEED_PLAYER_IDS.alice,
          done: true,
          failed: false,
        },
        {
          card: { suit: "yellow", rank: 8 },
          ownerId: SEED_PLAYER_IDS.mara,
          done: true,
          failed: false,
        },
        {
          card: { suit: "blue", rank: 5 },
          ownerId: SEED_PLAYER_IDS.jonas,
          done: true,
          failed: false,
        },
      ],
      outcome: "won",
      resultDetail: "Every task completed — clean run.",
      deadline: null,
    },
  };
}

// ─── Hold ──────────────────────────────────────────────────────────

const HOLD_PLAYERS = roster(4);

// A representative tower layout. Every cell here is off the enemy
// path (see PATH in games/hold/data.ts) so HoldBoard places them on
// buildable tiles.
function holdTowers() {
  return [
    {
      id: "t1",
      ownerId: SEED_PLAYER_IDS.alice,
      type: "cannon" as const,
      level: 2,
      cell: { x: 4, y: 3 },
    },
    {
      id: "t2",
      ownerId: SEED_PLAYER_IDS.eric,
      type: "arc" as const,
      level: 1,
      cell: { x: 7, y: 3 },
    },
    {
      id: "t3",
      ownerId: SEED_PLAYER_IDS.mara,
      type: "frost" as const,
      level: 1,
      cell: { x: 6, y: 5 },
    },
    {
      id: "t4",
      ownerId: SEED_PLAYER_IDS.jonas,
      type: "sniper" as const,
      level: 2,
      cell: { x: 9, y: 6 },
    },
    {
      id: "t5",
      ownerId: SEED_PLAYER_IDS.eric,
      type: "cannon" as const,
      level: 1,
      cell: { x: 5, y: 2 },
    },
  ];
}

// Wave 3 of 8, planning phase: towers up, two players readied.
export function holdPlanningView(): PublicRoomView {
  const base = baseView("hold", HOLD_PLAYERS);
  const order = HOLD_PLAYERS.map((p) => p.id);
  return {
    ...base,
    state: "playing",
    gameState: {
      phase: "planning",
      waveNumber: 2,
      totalWaves: 8,
      coreHp: 16,
      coreMaxHp: 20,
      towers: holdTowers(),
      supply: {
        [SEED_PLAYER_IDS.alice]: 40,
        [SEED_PLAYER_IDS.eric]: 65,
        [SEED_PLAYER_IDS.mara]: 30,
        [SEED_PLAYER_IDS.jonas]: 55,
      },
      ready: {
        [SEED_PLAYER_IDS.alice]: true,
        [SEED_PLAYER_IDS.eric]: false,
        [SEED_PLAYER_IDS.mara]: true,
        [SEED_PLAYER_IDS.jonas]: false,
      },
      order,
      lastResult: null,
      deadline: futureDeadline(95),
    },
  };
}

// The wave-3 reveal — the resolved wave being replayed.
export function holdRevealView(): PublicRoomView {
  const planning = holdPlanningView();
  const state = planning.gameState as Record<string, unknown>;
  return {
    ...planning,
    gameState: {
      ...state,
      phase: "reveal",
      coreHp: 14,
      lastResult: {
        waveNumber: 2,
        coreHpLost: 2,
        bounty: 28,
        leaked: 2,
        killed: 11,
      },
      deadline: null,
    },
  };
}

// ─── Game catalogue ────────────────────────────────────────────────

export type PreviewGame = {
  slug: string;
  name: string;
  tagline: string;
};

export const PREVIEW_GAMES: PreviewGame[] = [
  {
    slug: "imposter",
    name: "Imposter",
    tagline: "Social deduction — one player is bluffing.",
  },
  {
    slug: "wavelength",
    name: "Wavelength",
    tagline: "Dial in on a hidden spot on a spectrum.",
  },
  {
    slug: "just-one",
    name: "Just One",
    tagline: "Cooperative clues — duplicates cancel out.",
  },
  {
    slug: "crew",
    name: "Crew",
    tagline: "Co-op trick-taking with secret tasks.",
  },
  {
    slug: "hold",
    name: "Hold",
    tagline: "Co-op tower defense — hold the line.",
  },
];
