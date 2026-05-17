// Pure state-transition helpers for Crew. Mirrors the just-one /
// wavelength state.ts pattern: pure functions, no Supabase, easy to
// reason about and unit-test. The server calls these from the
// /api/rooms/[code]/crew/* routes and persists the result to
// rooms.game_state.
import {
  CREW_COLORS,
  CREW_TURN_MS,
  cardId,
  deadlineFromNow,
  rocketCountFor,
  sameCard,
  type CrewCard,
  type CrewCommunication,
  type CrewState,
  type CrewTask,
  type CrewTrickPlay,
} from "./types";

// ── Deck ─────────────────────────────────────────────────────────

// Build a deck sized so it deals evenly across the table: 36 colored
// cards (4 suits × 1-9) plus 3 or 4 rockets.
function buildDeck(playerCount: number): CrewCard[] {
  const deck: CrewCard[] = [];
  for (const color of CREW_COLORS) {
    for (let rank = 1; rank <= 9; rank++) {
      deck.push({ suit: color, rank });
    }
  }
  const rockets = rocketCountFor(playerCount);
  for (let rank = 1; rank <= rockets; rank++) {
    deck.push({ suit: "rocket", rank });
  }
  return deck;
}

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Sort a hand for stable display: colored suits grouped, then rockets,
// ascending rank within each.
function sortHand(hand: CrewCard[]): CrewCard[] {
  const suitOrder: Record<string, number> = {
    blue: 0,
    green: 1,
    pink: 2,
    yellow: 3,
    rocket: 4,
  };
  return [...hand].sort((a, b) => {
    if (a.suit !== b.suit) return suitOrder[a.suit] - suitOrder[b.suit];
    return a.rank - b.rank;
  });
}

function handSizesOf(hands: Record<string, CrewCard[]>): Record<string, number> {
  const sizes: Record<string, number> = {};
  for (const [pid, cards] of Object.entries(hands)) {
    sizes[pid] = cards.length;
  }
  return sizes;
}

// ── Match setup ──────────────────────────────────────────────────

export function initMatch(playerIds: string[]): CrewState {
  const order = shuffle(playerIds);
  const deck = shuffle(buildDeck(order.length));
  const handSize = deck.length / order.length;

  const hands: Record<string, CrewCard[]> = {};
  order.forEach((pid, i) => {
    hands[pid] = sortHand(deck.slice(i * handSize, (i + 1) * handSize));
  });

  // The crew member holding the top rocket leads the first trick.
  const topRocket = rocketCountFor(order.length);
  const leaderId =
    order.find((pid) =>
      hands[pid].some(
        (c) => c.suit === "rocket" && c.rank === topRocket
      )
    ) ?? order[0];

  // One task per player: distinct colored cards, distinct owners.
  const coloredCards = deck.filter((c) => c.suit !== "rocket");
  const taskCards = shuffle(coloredCards).slice(0, order.length);
  const taskOwners = shuffle(order);
  const tasks: CrewTask[] = taskCards.map((card, i) => ({
    card,
    ownerId: taskOwners[i],
    done: false,
    failed: false,
  }));

  const communications: Record<string, CrewCommunication | null> = {};
  for (const pid of order) communications[pid] = null;

  return {
    phase: "play",
    hands,
    handSizes: handSizesOf(hands),
    tasks,
    order,
    leaderId,
    turnId: leaderId,
    currentTrick: [],
    trickNumber: 0,
    totalTricks: handSize,
    lastTrick: null,
    communications,
    outcome: null,
    resultDetail: null,
    deadline: deadlineFromNow(CREW_TURN_MS),
  };
}

export function replayMatch(playerIds: string[]): CrewState {
  return initMatch(playerIds);
}

// ── Trick logic ──────────────────────────────────────────────────

// Which cards in `hand` may legally be played given the trick so far.
// Leading (empty trick) → anything. Otherwise must follow the led
// suit if able.
export function legalCards(
  hand: CrewCard[],
  currentTrick: CrewTrickPlay[]
): CrewCard[] {
  if (currentTrick.length === 0) return hand;
  const ledSuit = currentTrick[0].card.suit;
  const sameSuit = hand.filter((c) => c.suit === ledSuit);
  return sameSuit.length > 0 ? sameSuit : hand;
}

// Winner of a completed trick: highest rocket if any rocket was
// played, else the highest card of the led suit.
export function trickWinner(plays: CrewTrickPlay[]): string {
  let best = plays[0];
  const ledSuit = plays[0].card.suit;
  for (const play of plays.slice(1)) {
    const c = play.card;
    const b = best.card;
    const cRocket = c.suit === "rocket";
    const bRocket = b.suit === "rocket";
    if (cRocket && !bRocket) {
      best = play;
    } else if (cRocket && bRocket) {
      if (c.rank > b.rank) best = play;
    } else if (!cRocket && !bRocket) {
      // Neither is a rocket: only a higher card of the led suit beats
      // the current best (which is always the led suit here).
      if (c.suit === ledSuit && c.rank > b.rank) best = play;
    }
  }
  return best.playerId;
}

function nextSeat(order: string[], playerId: string): string {
  const idx = order.indexOf(playerId);
  return order[(idx + 1) % order.length];
}

// ── Playing a card ───────────────────────────────────────────────

// Apply `playerId` playing `card`. Validates turn + legality; returns
// `prev` unchanged on any violation (routes should pre-validate and
// surface a clean error, this is the safety net). When the trick
// completes it resolves: checks tasks, advances or ends the mission.
export function applyPlay(
  prev: CrewState,
  playerId: string,
  card: CrewCard
): CrewState {
  if (prev.phase !== "play") return prev;
  if (prev.turnId !== playerId) return prev;
  const hand = prev.hands[playerId] ?? [];
  if (!hand.some((c) => sameCard(c, card))) return prev;
  if (!legalCards(hand, prev.currentTrick).some((c) => sameCard(c, card))) {
    return prev;
  }

  const hands = {
    ...prev.hands,
    [playerId]: hand.filter((c) => !sameCard(c, card)),
  };
  const currentTrick = [...prev.currentTrick, { playerId, card }];

  // Trick still in progress — pass to the next seat.
  if (currentTrick.length < prev.order.length) {
    return {
      ...prev,
      hands,
      handSizes: handSizesOf(hands),
      currentTrick,
      turnId: nextSeat(prev.order, playerId),
      deadline: deadlineFromNow(CREW_TURN_MS),
    };
  }

  // Trick complete — resolve it.
  return resolveTrick({ ...prev, hands }, currentTrick);
}

function resolveTrick(
  prev: CrewState,
  trick: CrewTrickPlay[]
): CrewState {
  const winnerId = trickWinner(trick);
  const trickCards = trick.map((p) => p.card);

  // Settle any task cards that appeared in this trick.
  let anyFailed = false;
  const tasks: CrewTask[] = prev.tasks.map((task) => {
    if (task.done || task.failed) return task;
    const inTrick = trickCards.some((c) => sameCard(c, task.card));
    if (!inTrick) return task;
    if (winnerId === task.ownerId) {
      return { ...task, done: true };
    }
    anyFailed = true;
    return { ...task, failed: true };
  });

  const handSizes = handSizesOf(prev.hands);
  const lastTrick = { plays: trick, winnerId };
  const allDone = tasks.every((t) => t.done);
  const isLastTrick = prev.trickNumber + 1 >= prev.totalTricks;

  // Mission lost: a task card was won by the wrong crew member.
  if (anyFailed) {
    const failed = tasks.find((t) => t.failed)!;
    return {
      ...prev,
      tasks,
      handSizes,
      currentTrick: [],
      lastTrick,
      outcome: "lost",
      resultDetail: `A task card (${cardId(failed.card)}) was won by the wrong crew member.`,
      phase: "reveal",
      deadline: null,
    };
  }

  // Mission won: every task is complete.
  if (allDone) {
    return {
      ...prev,
      tasks,
      handSizes,
      currentTrick: [],
      lastTrick,
      outcome: "won",
      resultDetail: "Every task completed. Mission accomplished.",
      phase: "reveal",
      deadline: null,
    };
  }

  // Out of cards with tasks still open — mission lost.
  if (isLastTrick) {
    const open = tasks.filter((t) => !t.done).length;
    return {
      ...prev,
      tasks,
      handSizes,
      currentTrick: [],
      lastTrick,
      outcome: "lost",
      resultDetail: `Out of cards with ${open} task${open === 1 ? "" : "s"} still unfinished.`,
      phase: "reveal",
      deadline: null,
    };
  }

  // Next trick — winner leads.
  return {
    ...prev,
    tasks,
    handSizes,
    currentTrick: [],
    lastTrick,
    leaderId: winnerId,
    turnId: winnerId,
    trickNumber: prev.trickNumber + 1,
    deadline: deadlineFromNow(CREW_TURN_MS),
  };
}

// ── Communication ────────────────────────────────────────────────

// If `card` is communicable from `hand`, return how (highest / lowest
// / only of its color). Rockets can never be communicated; a card
// that is neither the highest, lowest, nor only of its color can't be
// either. Returns null when the card is not communicable.
export function communicationKind(
  hand: CrewCard[],
  card: CrewCard
): CrewCommunication["kind"] | null {
  if (card.suit === "rocket") return null;
  if (!hand.some((c) => sameCard(c, card))) return null;
  const sameColor = hand.filter((c) => c.suit === card.suit);
  if (sameColor.length === 1) return "only";
  const ranks = sameColor.map((c) => c.rank);
  if (card.rank === Math.max(...ranks)) return "highest";
  if (card.rank === Math.min(...ranks)) return "lowest";
  return null;
}

// Apply a communication: the player reveals one card. The card stays
// in their hand — communicating only exposes information. One token
// per player per mission. Returns `prev` unchanged on any violation.
export function applyCommunicate(
  prev: CrewState,
  playerId: string,
  card: CrewCard
): CrewState {
  if (prev.phase !== "play") return prev;
  if (prev.communications[playerId]) return prev; // token already spent
  const hand = prev.hands[playerId] ?? [];
  const kind = communicationKind(hand, card);
  if (!kind) return prev;
  return {
    ...prev,
    communications: {
      ...prev.communications,
      [playerId]: { card, kind },
    },
  };
}

// ── Deadline expiry ──────────────────────────────────────────────

// Idempotent: only fires once the per-turn deadline has passed. A
// stalled player would freeze the whole room, so the server
// force-plays a legal card on their behalf — the lowest-ranked legal
// card (colored before rocket) to do the least damage.
export function expireMatch(prev: CrewState): CrewState {
  if (prev.phase !== "play") return prev;
  if (!prev.deadline) return prev;
  if (Date.now() < new Date(prev.deadline).getTime()) return prev;

  const hand = prev.hands[prev.turnId] ?? [];
  const legal = legalCards(hand, prev.currentTrick);
  if (legal.length === 0) return prev;
  const forced = [...legal].sort((a, b) => {
    if (a.suit === "rocket" && b.suit !== "rocket") return 1;
    if (a.suit !== "rocket" && b.suit === "rocket") return -1;
    return a.rank - b.rank;
  })[0];
  return applyPlay(prev, prev.turnId, forced);
}

// ── View redaction ───────────────────────────────────────────────

// Each player sees only their own hand. handSizes (counts), tasks,
// the trick in progress and all communications are public. At reveal
// every hand is exposed.
export function redactForViewer(
  state: CrewState,
  viewerId: string | null
): CrewState {
  if (state.phase === "reveal") return state;
  const hands: Record<string, CrewCard[]> = {};
  for (const pid of Object.keys(state.hands)) {
    hands[pid] = pid === viewerId ? state.hands[pid] : [];
  }
  return { ...state, hands };
}
