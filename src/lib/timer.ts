import type { RoomState } from "@/lib/game";

// Durations the player *sees* on the countdown. The server actually gives
// TIMER_GRACE_MS of extra time under the hood (see deadlineFor), so a
// submission at "0s" is still accepted — a little forgiveness that hides
// network jitter and last-second typing.
export const TIMER_DURATIONS_MS: Record<
  "playing" | "voting" | "guessing",
  number
> = {
  playing: 45_000,
  voting: 180_000,
  guessing: 60_000,
};

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
  state: "playing" | "voting" | "guessing"
): string {
  return new Date(
    Date.now() + TIMER_DURATIONS_MS[state] + TIMER_GRACE_MS
  ).toISOString();
}
