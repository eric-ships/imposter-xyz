import type { RoomState } from "@/lib/game";

export const TIMER_DURATIONS_MS: Record<
  "playing" | "voting" | "guessing",
  number
> = {
  playing: 45_000,
  voting: 120_000,
  guessing: 60_000,
};

export function hasTimer(
  state: RoomState
): state is "playing" | "voting" | "guessing" {
  return state === "playing" || state === "voting" || state === "guessing";
}

export function deadlineFor(
  state: "playing" | "voting" | "guessing"
): string {
  return new Date(Date.now() + TIMER_DURATIONS_MS[state]).toISOString();
}
