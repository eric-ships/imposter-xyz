// Crew game state. Lives in rooms.game_state jsonb when
// rooms.kind === 'crew'. Server-authoritative; clients see a
// per-viewer redacted copy via PublicRoomView.gameState (each player
// sees only their own hand).
//
// Crew is a cooperative trick-taking game (a digital take on "The
// Crew"). Every player is dealt a task: one specific card they must
// personally win in a trick. The crew wins the mission only if every
// task is completed; if any task card is won by the wrong player, the
// mission is lost immediately.
//
// Phases:
//   play    — tricks are played one card at a time, in seat order
//   reveal  — mission resolved (won or lost); host can start the next
//
// The lobby phase is tracked by rooms.state ("lobby"), not here —
// CrewState only exists once the match has started.
export type CrewPhase = "play" | "reveal";

// The four colored suits plus the trump suit. Colored suits run 1-9;
// rockets are the trump and run 1-3 (3-player deck) or 1-4.
export type CrewColor = "blue" | "green" | "pink" | "yellow";
export type CrewSuit = CrewColor | "rocket";

export const CREW_COLORS: CrewColor[] = [
  "blue",
  "green",
  "pink",
  "yellow",
];

export type CrewCard = {
  suit: CrewSuit;
  rank: number;
};

// A task: one specific (always non-rocket) card that ownerId must be
// the one to win in a trick.
export type CrewTask = {
  card: CrewCard;
  ownerId: string;
  done: boolean;
  failed: boolean;
};

// One card played into the current trick.
export type CrewTrickPlay = {
  playerId: string;
  card: CrewCard;
};

// A used communication token. The player reveals one card that is
// their highest / lowest / only card of that color. Rockets can never
// be communicated.
export type CrewCommunication = {
  card: CrewCard;
  kind: "highest" | "lowest" | "only";
};

export type CrewOutcome = "won" | "lost";

export type CrewState = {
  phase: CrewPhase;
  // Per-player hand. In the public view every hand but the viewer's
  // own is redacted to an empty array — use handSizes for counts.
  hands: Record<string, CrewCard[]>;
  // Per-player remaining card count. Always public (survives
  // redaction) so the UI can show how many cards each player holds.
  handSizes: Record<string, number>;
  // One task per player. tasks.length === player count.
  tasks: CrewTask[];
  // Seat order for the whole match. Trick play follows this order
  // starting from the trick leader.
  order: string[];
  // Who leads the current trick (won the previous one, or holds the
  // top rocket for trick 0).
  leaderId: string;
  // Whose turn it is to play a card right now.
  turnId: string;
  // Cards played into the trick in progress.
  currentTrick: CrewTrickPlay[];
  trickNumber: number; // 0-indexed
  totalTricks: number; // === starting hand size
  // The just-completed trick, kept for the UI to show who won what
  // before the next trick begins. Null at match start.
  lastTrick: { plays: CrewTrickPlay[]; winnerId: string } | null;
  // Per-player communication: the revealed card (or null if unused).
  communications: Record<string, CrewCommunication | null>;
  // Mission result. Null while still playing.
  outcome: CrewOutcome | null;
  // Human-readable reason shown at reveal.
  resultDetail: string | null;
  // Per-turn deadline (ISO). A stalled player would block everyone, so
  // each turn is timed; on expiry the server force-plays a legal card.
  deadline: string | null;
};

// Per-turn auto-advance window. Generous — Crew turns involve real
// thought — but bounded so one idle player can't freeze the room.
export const CREW_TURN_MS = 90_000;

export function deadlineFromNow(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

// Stable string id for a card, handy for React keys and equality.
export function cardId(c: CrewCard): string {
  return `${c.suit}-${c.rank}`;
}

export function sameCard(a: CrewCard, b: CrewCard): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}

// Deal math: pick a deck that divides evenly across the table.
//   3 players → 39 cards (36 colored + rockets 1-3), 13 each
//   4 players → 40 cards (36 colored + rockets 1-4), 10 each
//   5 players → 40 cards (36 colored + rockets 1-4), 8 each
// Returns how many rocket ranks to include (3 or 4).
export function rocketCountFor(playerCount: number): number {
  return playerCount === 3 ? 3 : 4;
}
