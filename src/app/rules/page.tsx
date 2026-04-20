import Link from "next/link";

export default function RulesPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-10 px-8 py-12">
      <header className="text-center">
        <div className="text-[10px] uppercase tracking-[0.4em] text-ink-faint">
          Rule book
        </div>
        <h1 className="mt-2 font-serif text-4xl italic text-ink">
          How to play
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-ink-soft">
          A short parlor game of bluffs and close reads.
          <br />
          Three to five players. Ten to fifteen minutes.
        </p>
      </header>

      <Section label="Setup">
        <p>
          One person creates a room and shares the four-letter code. Everyone
          joins with a nickname. Rooms hold three to five players; the host
          starts the round once at least three are in.
        </p>
        <p>
          When the round begins, a player is secretly chosen as the{" "}
          <em>imposter</em>. With five at the table, two imposters are
          seated instead of one — and they don&apos;t know about each
          other. Everyone else is a <em>crewmate</em>.
        </p>
      </Section>

      <Section label="What each side sees">
        <ul className="space-y-2 pl-0">
          <li>
            <span className="text-leaf">Crewmates</span> see the category and
            the secret word.
          </li>
          <li>
            <span className="text-oxblood">Imposter</span> sees only the
            category. They do not know the word.
          </li>
        </ul>
      </Section>

      <Section label="The clue phase">
        <p>
          Players take turns in a random order. On your turn you give one
          one-word clue that hints at the secret word.
        </p>
        <p>
          Crewmates want to signal enough that the group knows they&apos;re
          real, without making it trivial for the imposter to piece together
          the word. The imposter has to bluff a clue that fits the category
          convincingly enough to pass as a crewmate.
        </p>
        <p>
          Each player gives one clue per round. The table plays three full
          rounds of clues before voting.
        </p>
      </Section>

      <Section label="The vote">
        <p>
          After the clues, everyone votes for who they think is the imposter.
          You can&apos;t vote for yourself. Votes are locked in once cast.
        </p>
        <p>
          If one player has a clear plurality and they were an imposter,{" "}
          <span className="text-ink">that imposter is caught</span> and gets
          one last chance to guess the word. In five-player rooms the other
          imposter stays hidden — their fate is tied to the caught
          imposter&apos;s guess.
        </p>
        <p>
          If the vote is tied, nobody has a plurality, or the crowd fingered a
          crewmate,{" "}
          <span className="text-oxblood">the imposter team escapes</span> and
          wins the round outright.
        </p>
      </Section>

      <Section label="The final guess">
        <p>
          The caught imposter sees the category and every clue that was given,
          and submits one guess at the secret word. The system judges exact
          vs. close matches. If there&apos;s a second imposter at the table,
          they can only watch.
        </p>
      </Section>

      <Section label="Scoring">
        <ul className="space-y-2">
          <Outcome
            label="Imposter escapes"
            detail="+2 each imposter · 0 crewmates"
          />
          <Outcome
            label="Caught, guessed exactly"
            detail="+2 each imposter · 0 crewmates"
          />
          <Outcome
            label="Caught, close guess"
            detail="+1 each imposter · +1 each crewmate"
          />
          <Outcome
            label="Caught, wrong guess"
            detail="0 imposters · +1 each crewmate"
          />
        </ul>
      </Section>

      <Section label="Timers">
        <p>
          Every phase has a clock so the room doesn&apos;t stall on a
          disconnected or distracted player.
        </p>
        <ul className="space-y-2">
          <Timer label="Clue (per turn)" value="45 seconds" />
          <Timer label="Vote" value="2 minutes" />
          <Timer label="Imposter&rsquo;s guess" value="60 seconds" />
        </ul>
        <p>
          If the clock runs out on a clue, the player is skipped with a blank
          clue and the turn passes. If the vote timer expires, the room tallies
          whatever votes were cast. If the imposter doesn&apos;t submit a
          guess, it counts as a wrong guess.
        </p>
      </Section>

      <Section label="Playing for a pot">
        <p>
          The host can optionally turn on a pot in the lobby. Every player
          antes one USDC on Base; the contract holds it until the round is
          resolved.
        </p>
        <ul className="space-y-2">
          <Outcome
            label="Imposter wins"
            detail="imposter takes the entire pot"
          />
          <Outcome
            label="Crewmates win"
            detail="pot is split evenly among crewmates"
          />
          <Outcome
            label="Close guess"
            detail="pot is split across the whole table"
          />
        </ul>
        <p>
          If the host voids the game mid-round, every ante is refunded to its
          original wallet.
        </p>
      </Section>

      <div className="flex justify-center border-t border-line-soft pt-8">
        <Link
          href="/"
          className="rounded-sm border border-ink px-6 py-3 text-[11px] uppercase tracking-[0.3em] text-ink transition hover:bg-ink hover:text-page"
        >
          Back to the table
        </Link>
      </div>
    </main>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-[10px] uppercase tracking-[0.4em] text-ink-faint">
        {label}
      </h2>
      <div className="space-y-3 text-sm leading-relaxed text-ink-soft">
        {children}
      </div>
    </section>
  );
}

function Outcome({ label, detail }: { label: string; detail: string }) {
  return (
    <li className="flex items-baseline justify-between gap-4 border-b border-line-soft pb-2 last:border-none last:pb-0">
      <span className="font-serif text-base italic text-ink">{label}</span>
      <span className="text-right text-[11px] uppercase tracking-[0.2em] text-ink-soft">
        {detail}
      </span>
    </li>
  );
}

function Timer({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-baseline justify-between gap-4 border-b border-line-soft pb-2 last:border-none last:pb-0">
      <span className="text-sm text-ink">{label}</span>
      <span className="font-serif text-base italic tabular-nums text-ink">
        {value}
      </span>
    </li>
  );
}
