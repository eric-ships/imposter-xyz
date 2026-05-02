import type { RoomState } from "@/lib/game";

// Durations the player *sees* on the countdown, scaled by player count.
// Bigger tables get a faster clue clock (less downtime per round) and a
// roomier vote (more clues to weigh, more candidates to suspect).
//
// The server actually gives TIMER_GRACE_MS of extra time under the hood
// (see deadlineFor), so a submission at "0s" is still accepted — a little
// forgiveness that hides network jitter and last-second typing.
export function timerDurationsFor(
  playerCount: number
): Record<"playing" | "voting" | "guessing", number> {
  const big = playerCount >= 5;
  return {
    playing: big ? 30_000 : 45_000,
    voting: big ? 240_000 : 180_000,
    guessing: 90_000,
  };
}

// Default fallback when player count isn't known (e.g. legacy paths).
// Matches the small-table timing.
export const TIMER_DURATIONS_MS = timerDurationsFor(0);

// Silent buffer added to every deadline. The countdown UI subtracts this
// so the visible number hits 0 right as the displayed timer runs out,
// but the real /expire fires GRACE_MS later. Players get a little extra
// rope without knowing it.
export const TIMER_GRACE_MS = 5_000;

export function hasTimer(
  state: RoomState
): state is "playing" | "voting" | "guessing" {
  return state === "playing" || state === "voting" || state === "guessing";
}

export function deadlineFor(
  state: "playing" | "voting" | "guessing",
  playerCount: number = 0
): string {
  return new Date(
    Date.now() + timerDurationsFor(playerCount)[state] + TIMER_GRACE_MS
  ).toISOString();
}
