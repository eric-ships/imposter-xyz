"use client";

// PlayerCard — a roster row used by the imposter voting phase (and
// designed for the reveal callout, clue speaker row, and lobby chips,
// each migrated separately).
//
// Visual: avatar (with optional badge overlay), nickname + optional
// inline label, optional trailing status text. Three states drive
// the chrome:
//   - idle      → default border, hoverable
//   - selected  → accent border + soft accent wash + ring
//   - disabled  → faded, no pointer
//
// The "Tap to vote" peek-on-hover label that lived inline in the
// voting list isn't baked in — callers pass it via `trailing`,
// usually wrapped in opacity-0 group-hover/playercard:opacity-100 so
// the component itself stays opinion-free about hover affordances.

import type { ReactNode } from "react";
import { avatarFor } from "@/lib/avatar";

type State = "idle" | "selected" | "disabled";

export type PlayerCardProps = {
  player: { id: string; nickname: string; avatar?: string | null };
  // Optional roster — needed so each player gets a unique color slot
  // (vs the per-id hash fallback). See avatarFor.
  roster?: { id: string }[];
  state?: State;
  onClick?: () => void;
  title?: string;
  // Decoration sitting over the avatar (e.g. vote-cast checkmark).
  avatarBadge?: ReactNode;
  // Inline pill rendered next to the nickname.
  inlineLabel?: ReactNode;
  // Right-side status content.
  trailing?: ReactNode;
};

const STATE_CLASSES: Record<State, string> = {
  idle:
    "border-line bg-page hover:border-ink hover:bg-surface/60 hover:shadow-sm cursor-pointer",
  selected:
    "border-accent bg-accent/10 shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent)_10%,transparent)] cursor-pointer",
  disabled:
    "border-line-soft bg-line-soft/20 opacity-60 cursor-not-allowed",
};

export function PlayerCard({
  player,
  roster,
  state = "idle",
  onClick,
  title,
  avatarBadge,
  inlineLabel,
  trailing,
}: PlayerCardProps) {
  const av = avatarFor(player.id, player.nickname, player.avatar, roster);
  const isDisabled = state === "disabled";
  return (
    <button
      type="button"
      onClick={isDisabled ? undefined : onClick}
      disabled={isDisabled}
      title={title}
      className={`group/playercard relative flex w-full items-center gap-4 rounded-xl border px-4 py-4 text-left transition outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-page active:scale-[0.99] ${STATE_CLASSES[state]}`}
    >
      <div className="relative">
        <div
          className={`flex h-11 w-11 items-center justify-center rounded-full ${av.color} ${
            av.isCustom
              ? "border border-line text-2xl"
              : "text-base font-medium text-white"
          }`}
        >
          {av.initial}
        </div>
        {avatarBadge}
      </div>
      <div className="flex flex-1 items-baseline gap-2 text-xl font-medium text-ink">
        <span>{player.nickname}</span>
        {inlineLabel}
      </div>
      {trailing}
    </button>
  );
}
