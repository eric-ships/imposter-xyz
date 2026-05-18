"use client";

// Post-game payoff card. Shown on a game's end / reveal screen when
// the room was attributed to a squad: tells the viewer what the
// match they just finished did to their standing, and links through
// to the full squad scoreboard.
//
// Driven entirely by `view.you.squadStanding` — the caller gates on
// it being non-null before rendering this.
import Link from "next/link";
import type { SquadStanding } from "@/lib/game";

export function SquadPayoffCard({
  standing,
}: {
  standing: SquadStanding;
}) {
  const { groupId, groupName, lastDelta, rank, memberCount } = standing;

  // Phrase the points line gracefully — a 0-delta match shouldn't
  // read as "+0 this game".
  const pointsLine =
    lastDelta > 0
      ? `+${lastDelta} this game`
      : "no points this game";

  return (
    <Link
      href={`/group/${groupId}`}
      className="block rounded-xl border border-accent/40 bg-accent/5 px-4 py-3 transition hover:border-accent hover:bg-accent/10"
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent"
        />
        <span className="font-serif text-base text-ink">
          {groupName}
        </span>
        <span className="text-ink-faint">·</span>
        <span className="text-sm text-ink-soft">{pointsLine}</span>
        <span className="ml-auto rounded-lg border border-accent/50 bg-accent/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
          #{rank} of {memberCount}
        </span>
      </div>
      <div className="mt-1.5 pl-[1.125rem] text-[11px] uppercase tracking-[0.16em] text-ink-faint">
        Squad standings →
      </div>
    </Link>
  );
}
