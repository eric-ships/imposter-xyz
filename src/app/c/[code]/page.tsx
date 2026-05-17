// /c/[code] — human-facing share landing page. Someone clicking a
// share link from social lands here. Renders the card image inline
// + a "Play on Upper" CTA, and crucially sets og:image / twitter:
// image so social previews (Twitter, Discord, iMessage, IG link
// preview, LinkedIn) show the card thumbnail.
//
// Server-rendered: lets us set per-match og:title from the match
// snapshot. Fallback to brand defaults when the room doesn't
// exist (room GC'd, etc.).

import type { Metadata } from "next";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { MatchHistoryEntry } from "@/lib/match-history";

type Props = {
  params: Promise<{ code: string }>;
};

function siteOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "https://upper.games"
  );
}

async function fetchLatestMatch(
  code: string
): Promise<MatchHistoryEntry | null> {
  const { data: room } = await supabaseAdmin
    .from("rooms")
    .select("match_history")
    .eq("code", code)
    .maybeSingle();
  const history =
    (room?.match_history as MatchHistoryEntry[] | null) ?? [];
  return history.length > 0 ? history[0] : null;
}

function ogTitleFor(match: MatchHistoryEntry | null): string {
  if (!match) return "Upper · party games for the group";
  if ("kind" in match && match.kind === "wavelength") {
    return `Wavelength · ${match.topScore} points · upper.games`;
  }
  if ("kind" in match && match.kind === "just-one") {
    return `Just One · ${match.score} / ${match.totalCards} · ${match.rating}`;
  }
  if ("kind" in match && match.kind === "crew") {
    const done = match.perPlayer.filter((p) => p.taskDone).length;
    return `Crew · ${match.outcome === "won" ? "mission won" : "mission lost"} · ${done} / ${match.taskCount} tasks`;
  }
  return `Imposter · "${match.secretWord}" · ${match.winner === "imposter" ? "imposter wins" : match.winner === "crewmates" ? "crewmates win" : "split"}`;
}

export async function generateMetadata({
  params,
}: Props): Promise<Metadata> {
  const { code: raw } = await params;
  const code = raw.toUpperCase();
  const match = await fetchLatestMatch(code);
  const cardUrl = `${siteOrigin()}/api/cards/match/${code}`;
  const title = ogTitleFor(match);
  const description =
    "Short, social games for friends — Imposter, Wavelength, Just One.";
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${siteOrigin()}/c/${code}`,
      siteName: "Upper",
      type: "website",
      images: [
        {
          url: cardUrl,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [cardUrl],
    },
  };
}

export default async function ShareLandingPage({ params }: Props) {
  const { code: raw } = await params;
  const code = raw.toUpperCase();
  const cardUrl = `/api/cards/match/${code}`;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col items-center justify-center gap-8 px-6 py-12">
      <Link
        href="/"
        className="text-[11px] uppercase tracking-[0.22em] text-ink-faint transition hover:text-ink"
      >
        ← Upper
      </Link>

      {/* Card image. The aspect ratio is fixed so the layout doesn't
          jump when the image loads. */}
      <div className="w-full overflow-hidden rounded-sm border border-line-soft">
        <img
          src={cardUrl}
          alt="Match recap"
          width={1200}
          height={630}
          className="w-full"
        />
      </div>

      <div className="flex flex-col items-center gap-3 text-center">
        <p className="text-sm leading-relaxed text-ink-soft">
          Short, social games for friends. Three games, one room,
          three to eight players.
        </p>
        <Link
          href="/"
          className="rounded-sm bg-ink px-6 py-3 text-[11px] uppercase tracking-[0.22em] text-page transition hover:bg-accent active:scale-[0.97]"
        >
          Play on Upper
        </Link>
      </div>
    </main>
  );
}
