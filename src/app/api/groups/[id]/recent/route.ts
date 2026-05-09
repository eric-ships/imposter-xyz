import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { MatchHistoryEntry } from "@/lib/match-history";

// GET /api/groups/[id]/recent?userId=X[&limit=30]
// Member-only. Returns the group's most recent matches with each
// snapshot intact. Default limit 30, max 100.
//
// Snapshot is the existing MatchHistoryEntry union — the lobby's
// match-history rendering pattern from imposter / wavelength /
// just-one bodies all consume this shape, so the recent-matches UI
// can reuse those panels.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: groupId } = await params;
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId")?.trim();
  const limitRaw = url.searchParams.get("limit");
  const limit = Math.max(
    1,
    Math.min(100, Number.parseInt(limitRaw ?? "30", 10) || 30)
  );
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

  const { data: matches, error } = await supabaseAdmin
    .from("match_results")
    .select("id, game_kind, ended_at, room_code, snapshot")
    .eq("group_id", groupId)
    .order("ended_at", { ascending: false })
    .limit(limit);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    matches: (matches ?? []).map((m) => ({
      id: m.id as string,
      gameKind: m.game_kind as string,
      endedAt: m.ended_at as string,
      roomCode: m.room_code as string,
      snapshot: m.snapshot as MatchHistoryEntry,
    })),
  });
}
