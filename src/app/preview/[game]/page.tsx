// Static per-game preview route. One page per game kind, each
// prerendered at build time via generateStaticParams. The actual
// rendering happens in the PreviewStage client component (the game
// UIs are client components).
import type { Metadata } from "next";
import { PreviewStage } from "../PreviewStage";
import { PREVIEW_GAMES } from "../mock";

export function generateStaticParams() {
  return PREVIEW_GAMES.map((g) => ({ game: g.slug }));
}

// Only the enumerated game slugs are valid; anything else 404s
// instead of being rendered on demand.
export const dynamicParams = false;

export async function generateMetadata({
  params,
}: PageProps<"/preview/[game]">): Promise<Metadata> {
  const { game } = await params;
  const entry = PREVIEW_GAMES.find((g) => g.slug === game);
  return {
    title: `Upper · ${entry?.name ?? "game"} preview`,
    robots: { index: false, follow: false },
  };
}

export default async function GamePreviewPage({
  params,
}: PageProps<"/preview/[game]">) {
  const { game } = await params;
  return <PreviewStage slug={game} />;
}
