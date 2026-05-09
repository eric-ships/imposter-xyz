import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  emptyRollup,
  rollupByUser,
  type RawMatchResult,
  type RawPlayerResult,
} from "@/lib/group-stats-aggregate";

// GET /api/groups/[id]/stats?userId=X[&since=ISO]
//
// Member-only. Returns per-member-per-game rollup of every match in
// the group (or only since the optional cutoff). Plus group totals.
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
  if (matchList.length === 0) {
    // Empty stats — return shape so the UI doesn't have to special-case
    // null vs empty.
    return NextResponse.json({
      totalMatches: 0,
      perMember: [],
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

  const matchByID = new Map(matchList.map((m) => [m.id, m]));
  const rollups = rollupByUser({
    playerResults: (playerResults ?? []) as RawPlayerResult[],
    matchByID,
  });

  // Decorate with member info from group_members + users so the UI
  // can render rows even for players who have never participated
  // (rollup will be empty for them).
  const { data: members } = await supabaseAdmin
    .from("group_members")
    .select("user_id, nickname, role")
    .eq("group_id", groupId);
  const memberRows = members ?? [];
  const userIds = memberRows.map((m) => m.user_id as string);
  const { data: users } = await supabaseAdmin
    .from("users")
    .select("id, default_avatar")
    .in("id", userIds);
  const userByID = new Map(
    (users ?? []).map((u) => [u.id as string, u])
  );

  const perMember = memberRows.map((m) => {
    const userId = m.user_id as string;
    const u = userByID.get(userId);
    return {
      userId,
      nickname: m.nickname as string,
      role: m.role as string,
      defaultAvatar: (u?.default_avatar as string | null) ?? null,
      games: rollups.get(userId) ?? emptyRollup(),
    };
  });

  return NextResponse.json({
    totalMatches: matchList.length,
    perMember,
  });
}
