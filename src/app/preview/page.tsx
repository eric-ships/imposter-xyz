// Static preview index. Lists every game with a link to its preview
// page. A dev / QA aid — no live room required to eyeball each game's
// in-game UI.
import Link from "next/link";
import type { Metadata } from "next";
import { PREVIEW_GAMES } from "./mock";

export const metadata: Metadata = {
  title: "Upper · game previews",
  robots: { index: false, follow: false },
};

export default function PreviewIndexPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-10 px-6 py-12 sm:px-8">
      <header className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">
          Upper · internal
        </div>
        <h1 className="font-serif text-4xl italic text-ink">
          Game previews
        </h1>
        <p className="text-sm text-ink-soft">
          Static, seeded snapshots of each game&apos;s in-game UI. The
          real components, fed hardcoded mid-game data — no live room
          needed. Each page stacks the key phases, labeled.
        </p>
      </header>

      <nav className="space-y-3">
        {PREVIEW_GAMES.map((game) => (
          <Link
            key={game.slug}
            href={`/preview/${game.slug}`}
            className="flex items-baseline justify-between gap-4 rounded-xl border border-line bg-surface/40 px-5 py-4 transition-all hover:border-ink hover:shadow-sm"
          >
            <span className="flex flex-col gap-1">
              <span className="font-serif text-xl text-ink">
                {game.name}
              </span>
              <span className="text-sm text-ink-soft">
                {game.tagline}
              </span>
            </span>
            <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
              View ▸
            </span>
          </Link>
        ))}
      </nav>

      <footer className="border-t border-line-soft pt-5 text-xs text-ink-faint">
        These pages are seeded with fixed mock data and never touch the
        server. Safe to ship.
      </footer>
    </main>
  );
}
