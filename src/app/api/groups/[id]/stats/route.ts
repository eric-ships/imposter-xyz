import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  computeStandings,
  emptyRollup,
  rollupByUser,
  type RawMatchResult,
  type RawPlayerResult,
} from "@/lib/group-stats-aggregate";

// GET /api/groups/[id]/stats?userId=X[&since=ISO]
//
// Member-only. Returns per-member-per-game rollup of every match in
// the group (or only since the optional cutoff), plus group totals
// and the squad `standings` (members ranked by total points).
//
// Aggregation lives in /lib/group-stats-aggregate so /api/users/me/stats
// can reuse it for the personal-cross-group rollup.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: groupId } = await params;
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId")?.trim();
  const since = url.searchParams.get("since")?.trim() || null;
  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  // Membership gate.
  const { data: membership } = await supabaseAdmin
    .from("group_members")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!membership) {
    return NextResponse.json({ error: "not a member" }, { status: 403 });
  }

  // Pull the group's matches (filtered by since if given).
  let matchesQuery = supabaseAdmin
    .from("match_results")
    .select("id, group_id, game_kind, ended_at")
    .eq("group_id", groupId);
  if (since) matchesQuery = matchesQuery.gte("ended_at", since);
  const { data: matches, error: matchesErr } = await matchesQuery.order(
    "ended_at",
    { ascending: false }
  );
  if (matchesErr) {
    return NextResponse.json(
      { error: matchesErr.message },
      { status: 500 }
    );
  }
  const matchList = (matches ?? []) as RawMatchResult[];

  // Member info from group_members + users, resolved per the
  // one-identity model: the per-group override nickname wins, else
  // the member's authored users.default_nickname, else "?". Pulled
  // up here (before the empty-matches early-out) so the standings
  // can still list every member at 0 points.
  const { data: members } = await supabaseAdmin
    .from("group_members")
    .select("user_id, nickname, role")
    .eq("group_id", groupId);
  const memberRows = members ?? [];
  const userIds = memberRows.map((m) => m.user_id as string);
  const { data: users } = await supabaseAdmin
    .from("users")
    .select("id, default_nickname, default_avatar")
    .in("id", userIds);
  const userByID = new Map(
    (users ?? []).map((u) => [u.id as string, u])
  );

  // Resolved display identity per member.
  const memberIdentity = memberRows.map((m) => {
    const userId = m.user_id as string;
    const u = userByID.get(userId);
    const nickname =
      (m.nickname as string | null) ??
      (u?.default_nickname as string | null) ??
      "?";
    return {
      userId,
      nickname,
      role: m.role as string,
      avatar: (u?.default_avatar as string | null) ?? null,
    };
  });

  if (matchList.length === 0) {
    // Empty stats — return shape so the UI doesn't have to special-case
    // null vs empty. Standings still list every member (all at 0).
    return NextResponse.json({
      totalMatches: 0,
      perMember: [],
      standings: computeStandings({
        members: memberIdentity,
        playerResults: [],
      }),
    });
  }

  const matchIds = matchList.map((m) => m.id);
  const { data: playerResults, error: prErr } = await supabaseAdmin
    .from("match_player_results")
    .select("match_id, user_id, role, won, delta")
    .in("match_id", matchIds);
  if (prErr) {
    return NextResponse.json({ error: prErr.message }, { status: 500 });
  }
  const prRows = (playerResults ?? []) as RawPlayerResult[];

  const matchByID = new Map(matchList.map((m) => [m.id, m]));
  const rollups = rollupByUser({
    playerResults: prRows,
    matchByID,
  });

  // Squad standings: members ranked by total points (sum of delta
  // across all the group's matches). Only result rows for matches in
  // this group are passed in, so this is naturally group-scoped.
  const standings = computeStandings({
    members: memberIdentity,
    playerResults: prRows,
  });

  const perMember = memberIdentity.map((m) => ({
    userId: m.userId,
    nickname: m.nickname,
    role: m.role,
    defaultAvatar: m.avatar,
    games: rollups.get(m.userId) ?? emptyRollup(),
  }));

  return NextResponse.json({
    totalMatches: matchList.length,
    perMember,
    standings,
  });
}
