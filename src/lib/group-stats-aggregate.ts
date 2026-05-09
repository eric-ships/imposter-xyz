// Pure aggregation helpers for group stats. Takes raw rows from
// match_results / match_player_results and rolls them up by member +
// game. Kept pure so it's easy to unit-test and reason about.
//
// Per-game shape differs because winning means different things:
//   imposter   → split W/L by role (imposter vs crewmate)
//   wavelength → top-scorer wins; track avg points
//   just-one   → cooperative; track avg team-score per match
//
// Lifted into its own module so both /api/groups/[id]/stats AND
// /api/users/me/stats can call it.

export type RawPlayerResult = {
  match_id: string;
  user_id: string;
  role: string | null;
  won: boolean | null;
  delta: number;
};

export type RawMatchResult = {
  id: string;
  group_id: string;
  game_kind: string;
  ended_at: string;
};

// Per-user, per-game rollup. All counters scoped to (user, game) within
// the input set — caller decides what scope (one group's matches, one
// user's lifetime, etc).
export type GameRollup = {
  imposter: {
    played: number;
    asImposter: { played: number; won: number };
    asCrewmate: { played: number; won: number };
    totalDelta: number;
  };
  wavelength: {
    played: number;
    won: number; // top-scorer count
    totalDelta: number; // sum of points across matches
  };
  justOne: {
    played: number;
    totalDelta: number; // sum of team-correct counts across matches
  };
};

export function emptyRollup(): GameRollup {
  return {
    imposter: {
      played: 0,
      asImposter: { played: 0, won: 0 },
      asCrewmate: { played: 0, won: 0 },
      totalDelta: 0,
    },
    wavelength: { played: 0, won: 0, totalDelta: 0 },
    justOne: { played: 0, totalDelta: 0 },
  };
}

// Build per-user rollups from joined match_player_results +
// match_results rows. Caller passes already-joined rows; we don't
// hit the DB here.
export function rollupByUser(args: {
  playerResults: RawPlayerResult[];
  matchByID: Map<string, RawMatchResult>;
}): Map<string, GameRollup> {
  const out = new Map<string, GameRollup>();
  for (const pr of args.playerResults) {
    const match = args.matchByID.get(pr.match_id);
    if (!match) continue;
    let r = out.get(pr.user_id);
    if (!r) {
      r = emptyRollup();
      out.set(pr.user_id, r);
    }
    if (match.game_kind === "imposter") {
      r.imposter.played += 1;
      r.imposter.totalDelta += pr.delta;
      if (pr.role === "imposter") {
        r.imposter.asImposter.played += 1;
        if (pr.won === true) r.imposter.asImposter.won += 1;
      } else if (pr.role === "crewmate") {
        r.imposter.asCrewmate.played += 1;
        if (pr.won === true) r.imposter.asCrewmate.won += 1;
      }
    } else if (match.game_kind === "wavelength") {
      r.wavelength.played += 1;
      r.wavelength.totalDelta += pr.delta;
      if (pr.won === true) r.wavelength.won += 1;
    } else if (match.game_kind === "just-one") {
      r.justOne.played += 1;
      r.justOne.totalDelta += pr.delta;
    }
  }
  return out;
}

// Win-rate helpers for the UI. Returns a 0-1 ratio or null if 0
// matches played in that bucket.
export function winRate(played: number, won: number): number | null {
  if (played === 0) return null;
  return won / played;
}

export function avg(played: number, total: number): number | null {
  if (played === 0) return null;
  return total / played;
}
