// Per-game card gradient. Each card is a two-anchor mix across the
// brand palette (see globals.css for the --upper-* tokens):
//
//   Imposter   red → magenta    (hottest, most attention-grabbing)
//   Wavelength blue → purple    (cool, spectrum-y, mental)
//   Just One   magenta → purple (cooperative, warm but not hot)
//   Crew       purple → blue    (cool quartet, contemplative co-op)
//   Hold       gold → amber     (fully-warm, treasure / defense)
//
// Lifted into its own module so the landing showcase and the in-room
// lobby picker share one source of truth — the row of game cards
// reads as the same lineup on every surface.

import type { GameKind } from "@/lib/game";

export const CARD_GRADIENT: Record<GameKind, string> = {
  imposter:
    "linear-gradient(135deg, var(--upper-red) 0%, var(--upper-magenta) 100%)",
  wavelength:
    "linear-gradient(135deg, var(--upper-blue) 0%, var(--upper-purple) 100%)",
  "just-one":
    "linear-gradient(135deg, var(--upper-magenta) 0%, var(--upper-purple) 100%)",
  crew: "linear-gradient(135deg, var(--upper-purple) 0%, var(--upper-blue) 100%)",
  hold: "linear-gradient(135deg, var(--upper-gold) 0%, var(--upper-amber) 100%)",
};
