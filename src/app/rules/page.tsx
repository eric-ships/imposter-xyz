"use client";

import Link from "next/link";
import { buttonClasses } from "@/components/Button";

export default function RulesPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-12 px-8 py-12">
      <header className="text-center">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft">
          Upper · rule book
        </div>
        <h1 className="mt-2 font-serif text-4xl italic text-ink">
          How to play
        </h1>
        <p className="mt-3 text-sm text-ink-soft">
          Five short games. Pick one in the lobby and bring three to
          eight friends.
        </p>
        <nav className="mt-6 flex flex-wrap justify-center gap-2">
          {(
            [
              ["Imposter", "imposter"],
              ["Wavelength", "wavelength"],
              ["Just One", "just-one"],
              ["Crew", "crew"],
              ["Hold", "hold"],
            ] as const
          ).map(([name, slug]) => (
            <a
              key={slug}
              href={`#${slug}`}
              className="rounded-full border border-line px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft transition hover:border-ink hover:text-ink"
            >
              {name}
            </a>
          ))}
        </nav>
      </header>

      {/* ───────────────────── Imposter ───────────────────── */}
      <article id="imposter" className="scroll-mt-12 space-y-10">
        <header className="border-b border-line pb-4">
          <h2 className="font-serif text-3xl italic text-ink">Imposter</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            A short parlor game of bluffs and close reads.
            <br />
            Three to eight players. Ten to fifteen minutes.
          </p>
        </header>

        <Section label="Setup">
          <p>
            One person creates a room and shares the four-letter code.
            Everyone joins with a nickname. Rooms hold three to eight
            players; the host starts the round once at least three are in.
          </p>
          <p>
            When the round begins, players are secretly chosen as the{" "}
            <em>imposter</em>. The count scales with the table:
          </p>
          <ul className="space-y-1 pl-0">
            <li>3-4 players → 1 imposter</li>
            <li>5-7 players → 2 imposters</li>
            <li>8 players → 3 imposters</li>
          </ul>
          <p>
            Imposters don&apos;t know who else is on their team. Everyone
            else is a <em>crewmate</em>.
          </p>
        </Section>

        <Section label="What each side sees">
          <ul className="space-y-2 pl-0">
            <li>
              <span className="text-leaf">Crewmates</span> see the category
              and the secret word.
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
            Crewmates want to signal enough that the group knows
            they&apos;re real, without making it trivial for the imposter
            to piece together the word. The imposter has to bluff a clue
            that fits the category convincingly enough to pass as a
            crewmate.
          </p>
          <p>
            Each player gives one clue per round. The table plays three
            full rounds of clues before voting.
          </p>
        </Section>

        <Section label="The vote">
          <p>
            After the clues, everyone votes for who they think is the
            imposter. You can&apos;t vote for yourself. Votes are locked
            in once cast.
          </p>
          <p>
            If one player has a clear plurality and they were an imposter,{" "}
            <span className="text-ink">that imposter is caught</span> and
            gets one last chance to guess the word. When there are
            multiple imposters at the table, the others stay hidden —
            their fate is tied to the caught imposter&apos;s guess.
          </p>
          <p>
            A tie still counts as a catch if every top-tied target is an
            imposter (e.g. a 2-2 split between two imposters) — one of
            them takes the guess. But if the tie includes any crewmate, or
            the plurality lands on a crewmate,{" "}
            <span className="text-oxblood">the imposter team escapes</span>{" "}
            and wins the round outright.
          </p>
        </Section>

        <Section label="The final guess">
          <p>
            The caught imposter sees the category and every clue that was
            given, and submits one guess at the secret word. The system
            judges exact vs. close matches. If there&apos;s a second
            imposter at the table, they can only watch.
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
            <Timer label="Vote" value="3 minutes" />
            <Timer label="Imposter&rsquo;s guess" value="90 seconds" />
          </ul>
          <p>
            If the clock runs out on a clue, the player is skipped with a
            blank clue and the turn passes. If the vote timer expires, the
            room tallies whatever votes were cast. If the imposter
            doesn&apos;t submit a guess, it counts as a wrong guess.
          </p>
        </Section>

        <Section label="Playing for a pot">
          <p>
            The host can optionally turn on a pot in the lobby. Every
            player antes one USDC on Base; the contract holds it until the
            round is resolved.
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
            If the host voids the game mid-round, every ante is refunded to
            its original wallet.
          </p>
        </Section>
      </article>

      {/* ───────────────────── Wavelength ───────────────────── */}
      <article
        id="wavelength"
        className="scroll-mt-12 space-y-10 border-t border-line pt-12"
      >
        <header className="border-b border-line pb-4">
          <h2 className="font-serif text-3xl italic text-ink">Wavelength</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            A spectrum-guessing game of clue-giving and close calls.
            <br />
            Three to six players. Ten to twenty minutes.
          </p>
        </header>

        <Section label="Setup">
          <p>
            One person creates a Wavelength room and shares the
            four-letter code. Players join with a nickname. Three to six
            players is the sweet spot. The host starts the match once at
            least three are in.
          </p>
          <p>
            A match is two rounds per player at the table — so 6
            rounds with 3 players, 12 with 6. Each round one player is
            the <em>psychic</em>; the role rotates so everyone gets
            exactly two turns at it.
          </p>
        </Section>

        <Section label="What the psychic sees">
          <p>
            The psychic gets a <em>concept pair</em> like &ldquo;Cold ↔
            Hot&rdquo; or &ldquo;Boring ↔ Exciting&rdquo;, plus a hidden
            target band on the dial. The rest of the table sees only the
            concept — never the target.
          </p>
          <p>
            The psychic picks a clue word that they think lands on the
            target. Examples for &ldquo;Cold ↔ Hot&rdquo; with a target on
            the warm side: &ldquo;coffee&rdquo;, &ldquo;jacuzzi&rdquo;,
            &ldquo;August&rdquo;.
          </p>
        </Section>

        <Section label="The guess phase">
          <p>
            Once the psychic submits the clue, every other player drags
            their dial to where they think the target is. Guesses are
            independent — no coordinating. When the last guess locks in,
            the round resolves automatically.
          </p>
        </Section>

        <Section label="Scoring">
          <p>
            Each guesser earns points based on how close their dial
            landed:
          </p>
          <ul className="space-y-2">
            <Outcome label="Bullseye" detail="+4 points" />
            <Outcome label="Inner band" detail="+3 points" />
            <Outcome label="Outer band" detail="+2 points" />
            <Outcome label="Off the band" detail="0 points" />
          </ul>
          <p>
            The psychic earns the <span className="text-ink">highest</span>{" "}
            score among their guessers — connecting with at least one
            teammate is the goal of clue-giving, so missing one player
            shouldn&apos;t cancel out a great clue for another.
          </p>
          <p>
            <span className="text-leaf">Unanimous bullseye bonus:</span>{" "}
            if every guesser lands in the bullseye, everyone at the
            table (psychic included) gets a bonus +2 points.
          </p>
        </Section>

        <Section label="Winning">
          <p>
            After all the rounds, whoever has the most cumulative points
            wins. Ties are real ties — multiple winners on the
            scoreboard. The host can hit Play Again to reset scores and
            shuffle the psychic order for a fresh match.
          </p>
        </Section>

        <Section label="Timers">
          <ul className="space-y-2">
            <Timer label="Clue (psychic)" value="60 seconds" />
            <Timer label="Guess" value="45 seconds" />
          </ul>
          <p>
            If the psychic runs out of clue time, a blank clue is locked
            in and the round still plays out. If a guesser runs out of
            time, the middle of the dial is locked as their guess (which
            usually means zero points).
          </p>
        </Section>
      </article>

      {/* ───────────────────── Just One ───────────────────── */}
      <article
        id="just-one"
        className="scroll-mt-12 space-y-10 border-t border-line pt-12"
      >
        <header className="border-b border-line pb-4">
          <h2 className="font-serif text-3xl italic text-ink">Just One</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            A cooperative clue-giving game with a beautiful catch.
            <br />
            Three to seven players. Ten to twenty minutes.
          </p>
        </header>

        <Section label="Setup">
          <p>
            One person creates a Just One room and shares the
            four-letter code. Three to seven players is the sweet spot.
            The host starts the match once at least three are in.
          </p>
          <p>
            A match is two cards per player at the table — so 6
            cards with 3 players, 14 with 7. Each card has one player
            as the <em>guesser</em>; the role rotates.
          </p>
        </Section>

        <Section label="What each side sees">
          <ul className="space-y-2 pl-0">
            <li>
              <span className="text-ink">Clue-givers</span> see the
              secret word and write a one-word clue privately.
            </li>
            <li>
              <span className="text-accent">Guesser</span> sees nothing
              while clues are being written.
            </li>
          </ul>
        </Section>

        <Section label="The catch">
          <p>
            Before the guesser sees the clues, the system{" "}
            <span className="text-oxblood">silently eliminates</span>{" "}
            any duplicates. If two clue-givers wrote the same word
            (case-insensitive, with light stem matching like{" "}
            <em>banana</em> = <em>bananas</em>), both clues vanish. Any
            clue that matches the secret word is also eliminated. The
            guesser only sees what survived.
          </p>
          <p>
            That&apos;s the whole game. Coordinate without coordinating
            — write a clue your team won&apos;t also write.
          </p>
        </Section>

        <Section label="The guess">
          <p>
            The guesser sees the surviving clues (without knowing who
            wrote what) and submits one guess at the secret word. They
            can also skip the card if no clue is helpful — that
            counts as the card being played but not as a correct
            guess.
          </p>
        </Section>

        <Section label="Scoring">
          <p>
            Cooperative — the whole table shares one score. After all
            cards, your final tally gets a label:
          </p>
          <ul className="space-y-2">
            <Outcome label="Telepathic" detail="≥85% correct" />
            <Outcome label="Sharp" detail="≥60% correct" />
            <Outcome label="Solid" detail="≥35% correct" />
            <Outcome label="Warming up" detail="≥15% correct" />
            <Outcome label="Tough deck" detail="<15% correct" />
          </ul>
        </Section>

        <Section label="Timers">
          <ul className="space-y-2">
            <Timer label="Clue" value="60 seconds" />
            <Timer label="Guess" value="45 seconds" />
          </ul>
          <p>
            If clue time runs out, the card moves to the guess phase
            with whatever clues are in (missing players just don&apos;t
            help that round). If guess time runs out, the card counts
            as wrong.
          </p>
        </Section>
      </article>

      {/* ───────────────────── Crew ───────────────────── */}
      <article
        id="crew"
        className="scroll-mt-12 space-y-10 border-t border-line pt-12"
      >
        <header className="border-b border-line pb-4">
          <h2 className="font-serif text-3xl italic text-ink">Crew</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            A cooperative trick-taking game with secret tasks.
            <br />
            Three to five players. Fifteen to twenty-five minutes.
          </p>
        </header>

        <Section label="Setup">
          <p>
            Thirty-six colored cards (four suits of 1-9) plus three or
            four <em>rockets</em> as the trump suit. The deck deals out
            evenly across the table, so every hand is the same size.
          </p>
          <p>
            Each player is also dealt one <em>task</em>: a specific
            non-rocket card from the deck that <em>they</em> must
            personally win in a trick. Tasks are open — the table sees
            who has to win what. Whoever holds the highest rocket leads
            the first trick.
          </p>
        </Section>

        <Section label="Playing tricks">
          <p>
            On your turn you play any card. Other players in seat order
            must <em>follow suit</em> if they can — if a yellow led, you
            play yellow if you have any. If you&apos;re out of the led
            suit you can play anything, including a rocket.
          </p>
          <p>
            The trick is won by the highest rocket if any were played,
            otherwise by the highest card of the led suit. The winner
            leads the next trick.
          </p>
        </Section>

        <Section label="Communication">
          <p>
            You can&apos;t talk strategy — but each player has{" "}
            <span className="text-accent">one communication token</span>{" "}
            per match. Spend it before a trick to flip one non-rocket
            card from your hand face-up. The reveal also says whether
            that card is your <em>highest</em>, <em>lowest</em>, or{" "}
            <em>only</em> card of its color.
          </p>
          <p>
            That&apos;s the whole table-talk vocabulary. Use it well —
            once it&apos;s spent, it&apos;s gone for the rest of the
            mission.
          </p>
        </Section>

        <Section label="Winning the mission">
          <p>
            The crew wins if{" "}
            <span className="text-leaf">every task is completed</span> —
            each task-holder personally wins the trick containing their
            task card. The moment a task card is won by the wrong player
            the mission is lost; you can finish the deck or surrender
            and deal again.
          </p>
        </Section>

        <Section label="Timers">
          <ul className="space-y-2">
            <Timer label="Per card / signal" value="40 seconds" />
          </ul>
          <p>
            Run out of time and the server plays the lowest legal card
            for you. Rude, but it keeps the trick moving.
          </p>
        </Section>
      </article>

      {/* ───────────────────── Hold ───────────────────── */}
      <article
        id="hold"
        className="scroll-mt-12 space-y-10 border-t border-line pt-12"
      >
        <header className="border-b border-line pb-4">
          <h2 className="font-serif text-3xl italic text-ink">Hold</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            A cooperative tower-defense — hold the line for fourteen
            waves.
            <br />
            Three to five players. Twenty to thirty minutes.
          </p>
        </header>

        <Section label="The board">
          <p>
            One shared map: an S-curve path that enemies march down
            toward your <span className="text-oxblood">core</span>.
            Towers may be placed anywhere off the path. The core has 20
            HP — leak too many enemies and it&apos;s over.
          </p>
        </Section>

        <Section label="Towers">
          <ul className="space-y-2">
            <Outcome
              label="Cannon"
              detail="Heavy shots, ignores armor"
            />
            <Outcome
              label="Arc"
              detail="Chains to extra targets — swarm-killer"
            />
            <Outcome
              label="Frost"
              detail="Aura that slows enemies in range"
            />
            <Outcome label="Sniper" detail="Long range, hits flyers" />
          </ul>
          <p>
            Each tower can be upgraded once to level 2 (more damage,
            more range) or sold back for 60% of total spend if you
            misplaced it.
          </p>
        </Section>

        <Section label="Enemies">
          <ul className="space-y-2">
            <Outcome label="Runner" detail="Fast, low HP" />
            <Outcome label="Brute" detail="Slow, armored — cannons only" />
            <Outcome label="Flier" detail="Skips the path — snipers only" />
            <Outcome label="Shielded" detail="Resists the first hit" />
          </ul>
        </Section>

        <Section label="The round">
          <p>
            Every wave has two phases. In{" "}
            <span className="text-accent">planning</span> the table
            places towers, upgrades, or sells. When everyone hits{" "}
            <em>ready</em>, the wave plays as a deterministic
            simulation — same animation for every player.
          </p>
          <p>
            Survive every wave with at least 1 core HP and you win.
            Drop to zero and the mission fails.
          </p>
        </Section>

        <Section label="Economy">
          <ul className="space-y-2">
            <Timer label="Starting supply" value="14 per player" />
            <Timer label="Per-round income" value="+9 per player" />
            <Timer label="Sell refund" value="60% of spend" />
          </ul>
          <p>
            Bounty from kills accrues to the player whose tower landed
            the killing shot. Coordinate placements — uneven supply
            means uneven board coverage.
          </p>
        </Section>
      </article>

      <div className="flex justify-center border-t border-line-soft pt-8">
        <Link
          href="/"
          className={buttonClasses({ variant: "primary", size: "lg" })}
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
      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft">
        {label}
      </h3>
      <div className="space-y-3 text-base leading-relaxed text-ink-soft">
        {children}
      </div>
    </section>
  );
}

function Outcome({ label, detail }: { label: string; detail: string }) {
  return (
    <li className="flex items-baseline justify-between gap-4 border-b border-line-soft pb-2 last:border-none last:pb-0">
      <span className="text-base text-ink">{label}</span>
      <span className="text-right text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft">
        {detail}
      </span>
    </li>
  );
}

function Timer({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-baseline justify-between gap-4 border-b border-line-soft pb-2 last:border-none last:pb-0">
      <span className="text-sm text-ink">{label}</span>
      <span className="text-base tabular-nums text-ink">{value}</span>
    </li>
  );
}
