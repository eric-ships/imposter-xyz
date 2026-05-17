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

// ─── Squad standings ───────────────────────────────────────────────
//
// A squad's standings rank its members by total points (sum of
// match_player_results.delta across every one of the group's
// matches). Tiebreak: more matches played, then nickname A→Z.
//
// Used by /api/groups/[id]/stats AND room-state.ts (the post-game
// payoff card), so it lives here next to the other pure aggregators.

export type StandingRow = {
  userId: string;
  nickname: string;
  avatar: string | null;
  totalPoints: number;
  matchesPlayed: number;
  rank: number;
};

// Build the ranked standings. Caller passes the group's full member
// list (so members who've never played still get a row) plus the
// already-fetched player-result rows. Pure — no DB access here.
export function computeStandings(args: {
  members: { userId: string; nickname: string; avatar: string | null }[];
  playerResults: { user_id: string; delta: number }[];
}): StandingRow[] {
  // Tally points + matches per user from the result rows.
  const tally = new Map<string, { points: number; played: number }>();
  for (const pr of args.playerResults) {
    const cur = tally.get(pr.user_id) ?? { points: 0, played: 0 };
    cur.points += pr.delta;
    cur.played += 1;
    tally.set(pr.user_id, cur);
  }

  const rows = args.members.map((m) => {
    const t = tally.get(m.userId) ?? { points: 0, played: 0 };
    return {
      userId: m.userId,
      nickname: m.nickname,
      avatar: m.avatar,
      totalPoints: t.points,
      matchesPlayed: t.played,
      rank: 0, // filled in after the sort below
    };
  });

  // Rank: total points desc, then matches played desc, then name A→Z.
  rows.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints)
      return b.totalPoints - a.totalPoints;
    if (b.matchesPlayed !== a.matchesPlayed)
      return b.matchesPlayed - a.matchesPlayed;
    return a.nickname.localeCompare(b.nickname);
  });
  rows.forEach((r, i) => {
    r.rank = i + 1;
  });
  return rows;
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
