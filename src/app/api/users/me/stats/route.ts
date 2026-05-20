import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  emptyRollup,
  rollupByUser,
  type RawMatchResult,
  type RawPlayerResult,
} from "@/lib/group-stats-aggregate";

// GET /api/users/me/stats?userId=X
//
// Personal cross-group rollup. Aggregates the caller's match
// participation across every group they belong to. Private to the
// viewer — only the owner of `userId` should call it from their own
// device. We don't authenticate so that's a soft promise; the data
// returned is just the caller's own stats anyway, so worst-case
// information leak is bounded.
//
// Same shape as the per-member rollup in /api/groups/[id]/stats so
// the home-page card can reuse the rendering helpers.
export async function GET(request: Request) {
  const userId = new URL(request.url).searchParams
    .get("userId")
    ?.trim();
  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  // Pull every match the user participated in — across all groups.
  const { data: prRows, error: prErr } = await supabaseAdmin
    .from("match_player_results")
    .select("match_id, user_id, role, won, delta")
    .eq("user_id", userId);
  if (prErr) {
    return NextResponse.json({ error: prErr.message }, { status: 500 });
  }
  const playerResults = (prRows ?? []) as RawPlayerResult[];
  if (playerResults.length === 0) {
    return NextResponse.json({
      totalMatches: 0,
      games: emptyRollup(),
    });
  }

  const matchIds = Array.from(
    new Set(playerResults.map((r) => r.match_id))
  );
  const { data: matches, error: matchesErr } = await supabaseAdmin
    .from("match_results")
    .select("id, group_id, game_kind, ended_at")
    .in("id", matchIds);
  if (matchesErr) {
    return NextResponse.json(
      { error: matchesErr.message },
      { status: 500 }
    );
  }
  const matchByID = new Map(
    ((matches ?? []) as RawMatchResult[]).map((m) => [m.id, m])
  );

  const rollups = rollupByUser({ playerResults, matchByID });
  const my = rollups.get(userId) ?? emptyRollup();

  return NextResponse.json({
    totalMatches:
      my.imposter.played +
      my.wavelength.played +
      my.justOne.played +
      my.crew.played +
      my.hold.played,
    games: my,
  });
}
