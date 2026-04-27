import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { generateCandidates } from "@/lib/anthropic";
import { notifyRoom } from "@/lib/room-state";

// Candidates are now always generated at game start (the secret is
// picked from them), so this route is mostly a reader. The lazy
// generation branch remains as a safety net for legacy rooms started
// before that change landed.

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code: raw } = await params;
  const code = raw.toUpperCase();
  const playerId = new URL(request.url).searchParams.get("playerId");
  if (!playerId) {
    return NextResponse.json({ error: "playerId required" }, { status: 400 });
  }

  const { data: room } = await supabaseAdmin
    .from("rooms")
    .select("*")
    .eq("code", code)
    .maybeSingle();

  if (!room) {
    return NextResponse.json({ error: "room not found" }, { status: 404 });
  }

  const casualMode =
    "show_candidates_always" in room && !!room.show_candidates_always;
  const inActivePhase =
    room.state === "playing" ||
    room.state === "voting" ||
    room.state === "guessing";
  // Casual mode: candidates are public from the start of round 1, so any
  // active-game phase is fair game. Otherwise (default), restrict to the
  // guessing phase as before.
  const allowed =
    inActivePhase && (casualMode || room.state === "guessing");
  if (!allowed) {
    return NextResponse.json(
      { error: "candidates not available in this phase" },
      { status: 400 }
    );
  }

  // Verify the requester is actually a player in this room before spending
  // an API call on them.
  const { data: player } = await supabaseAdmin
    .from("players")
    .select("id")
    .eq("room_code", code)
    .eq("id", playerId)
    .maybeSingle();
  if (!player) {
    return NextResponse.json(
      { error: "not a player in this room" },
      { status: 403 }
    );
  }

  // Use the cached list if this round already produced one. This keeps the
  // imposter staring at the same set across refreshes, and avoids a second
  // Claude call (and the chance of a different list with different items).
  const cached: string[] = Array.isArray(room.guess_candidates)
    ? room.guess_candidates
    : [];
  if (cached.length > 0) {
    return NextResponse.json({ candidates: cached });
  }

  if (!room.category || !room.secret_word) {
    return NextResponse.json(
      { error: "round not initialized" },
      { status: 400 }
    );
  }

  const candidates = await generateCandidates(
    room.category,
    room.secret_word
  );

  // Best-effort cache. If the column doesn't exist yet (pre-migration) the
  // update will fail; we still return the freshly-generated list so the
  // feature works end-to-end before the migration lands.
  if ("guess_candidates" in room) {
    await supabaseAdmin
      .from("rooms")
      .update({ guess_candidates: candidates })
      .eq("code", code);
    // Broadcast so other clients refetch the room view and pick up the
    // newly-cached list — keeps everyone on the same candidate set.
    await notifyRoom(code, "candidates_ready");
  }

  return NextResponse.json({ candidates });
}
