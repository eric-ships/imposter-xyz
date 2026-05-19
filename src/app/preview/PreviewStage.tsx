"use client";

// Client-side preview renderer. Picks the requested game and renders
// its real in-game UI components, fed the hardcoded seeded mock state
// from ./mock. Each game's visually distinct phases are stacked and
// labeled so the team can scan them at once.
//
// The imposter game's phase components live in the room page and are
// exported from there; the other four games each export a *Body that
// dispatches on view.state / gameState.phase.

import Link from "next/link";
import { WavelengthBody } from "@/games/wavelength/WavelengthBody";
import { JustOneBody } from "@/games/just-one/JustOneBody";
import { CrewBody } from "@/games/crew/CrewBody";
import { HoldBody } from "@/games/hold/HoldBody";
import {
  PlayingPhase,
  VotingPhase,
  RevealPhase,
} from "@/app/room/[code]/page";
import {
  PREVIEW_GAMES,
  VIEWER_ID,
  imposterPlayingView,
  imposterVotingView,
  imposterRevealView,
  wavelengthGuessingView,
  wavelengthRevealView,
  justOneClueView,
  justOneRevealView,
  crewPlayView,
  crewRevealView,
  holdPlanningView,
  holdRevealView,
} from "./mock";

const CODE = "PREVUE";

// One labeled phase block. Mirrors the room page's content column
// width so the in-game UI lays out the way it does in a real room.
function PhasePanel({
  label,
  caption,
  children,
}: {
  label: string;
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="space-y-1 border-l-2 border-accent pl-3">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
          {label}
        </div>
        <div className="text-sm text-ink-soft">{caption}</div>
      </div>
      <div className="rounded-xl border border-line-soft bg-page p-5 sm:p-6">
        <div className="mx-auto max-w-2xl">{children}</div>
      </div>
    </section>
  );
}

type PhaseSpec = { label: string; caption: string; node: React.ReactNode };

function phasesFor(slug: string): PhaseSpec[] {
  switch (slug) {
    case "imposter":
      return [
        {
          label: "Clue phase",
          caption:
            "Round 2 of a Breakfast foods match. Eric (you) holds the word; Jonas is up to give a clue.",
          node: (
            <PlayingPhase
              view={imposterPlayingView()}
              playerId={VIEWER_ID}
              code={CODE}
            />
          ),
        },
        {
          label: "Voting phase",
          caption:
            "The table accuses. Three votes are in — the room is closing on Jonas.",
          node: (
            <VotingPhase
              view={imposterVotingView()}
              playerId={VIEWER_ID}
              code={CODE}
            />
          ),
        },
        {
          label: "Reveal phase",
          caption:
            "Jonas was the imposter, his last guess (Waffles) missed — crewmates win the round.",
          node: (
            <RevealPhase
              view={imposterRevealView()}
              playerId={VIEWER_ID}
              code={CODE}
              skipStaging
            />
          ),
        },
      ];
    case "wavelength":
      return [
        {
          label: "Guessing phase",
          caption:
            'Round 3 of 5. Mara is the psychic; clue "Lukewarm" on Cold ↔ Hot. Drag the dial.',
          node: (
            <WavelengthBody
              view={wavelengthGuessingView()}
              playerId={VIEWER_ID}
              code={CODE}
              userId={null}
            />
          ),
        },
        {
          label: "Reveal phase",
          caption:
            "Target was 52 — the table clustered tight around the clue and scored well.",
          node: (
            <WavelengthBody
              view={wavelengthRevealView()}
              playerId={VIEWER_ID}
              code={CODE}
              userId={null}
            />
          ),
        },
      ];
    case "just-one":
      return [
        {
          label: "Clue phase",
          caption:
            "Card 5 of 10. Priya is the guesser; Eric (you) writes a one-word clue.",
          node: (
            <JustOneBody
              view={justOneClueView()}
              playerId={VIEWER_ID}
              code={CODE}
              userId={null}
            />
          ),
        },
        {
          label: "Reveal phase",
          caption:
            'Secret was Volcano. Two players both wrote "lava" — both eliminated — but Priya still got it.',
          node: (
            <JustOneBody
              view={justOneRevealView()}
              playerId={VIEWER_ID}
              code={CODE}
              userId={null}
            />
          ),
        },
      ];
    case "crew":
      return [
        {
          label: "Play phase",
          caption:
            "Trick 3 of 10. Two cards on the table, your turn — Blue was led, one task already done.",
          node: (
            <CrewBody
              view={crewPlayView()}
              playerId={VIEWER_ID}
              code={CODE}
              userId={null}
            />
          ),
        },
        {
          label: "Reveal phase",
          caption: "Every task completed — the crew prevails.",
          node: (
            <CrewBody
              view={crewRevealView()}
              playerId={VIEWER_ID}
              code={CODE}
              userId={null}
            />
          ),
        },
      ];
    case "hold":
      return [
        {
          label: "Planning phase",
          caption:
            "Wave 3 of 8. Towers placed on the shared board; two crewmates have readied up.",
          node: (
            <HoldBody
              view={holdPlanningView()}
              playerId={VIEWER_ID}
              code={CODE}
              userId={null}
            />
          ),
        },
        {
          label: "Reveal phase",
          caption:
            "The wave replays — 11 enemies destroyed, 2 leaked through for 2 core damage.",
          node: (
            <HoldBody
              view={holdRevealView()}
              playerId={VIEWER_ID}
              code={CODE}
              userId={null}
            />
          ),
        },
      ];
    default:
      return [];
  }
}

export function PreviewStage({ slug }: { slug: string }) {
  const game = PREVIEW_GAMES.find((g) => g.slug === slug);
  const phases = phasesFor(slug);

  if (!game || phases.length === 0) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 px-6 py-12">
        <h1 className="font-serif text-3xl italic text-ink">
          Unknown game
        </h1>
        <p className="text-sm text-ink-soft">
          No preview for &quot;{slug}&quot;.
        </p>
        <Link
          href="/preview"
          className="text-sm font-medium text-accent hover:underline"
        >
          ◂ Back to all previews
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-12">
      <header className="space-y-3">
        <Link
          href="/preview"
          className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-faint transition hover:text-ink"
        >
          ◂ All previews
        </Link>
        <div className="flex items-baseline gap-3">
          <h1 className="font-serif text-4xl italic text-ink">
            {game.name}
          </h1>
          <span className="rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
            Preview
          </span>
        </div>
        <p className="text-sm text-ink-soft">{game.tagline}</p>
        <p className="text-xs text-ink-faint">
          Real in-game components, fed seeded mock data. Buttons render
          but actions are inert — there is no live room behind this
          page.
        </p>
      </header>

      <div className="space-y-10">
        {phases.map((p) => (
          <PhasePanel key={p.label} label={p.label} caption={p.caption}>
            {p.node}
          </PhasePanel>
        ))}
      </div>
    </main>
  );
}
