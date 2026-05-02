import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { notifyRoom } from "@/lib/room-state";

/**
 * Police mode: the secret cop spends their one investigation. Pick any
 * other player to learn whether they're an imposter. Idempotent
 * (returns the cached result if already used). Allowed during
 * playing OR voting; locked once we hit guessing/reveal.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code: raw } = await params;
  const code = raw.toUpperCase();
  const { playerId, targetId } = (await request.json()) as {
    playerId?: string;
    targetId?: string;
  };
  if (!playerId || !targetId) {
    return NextResponse.json(
      { error: "playerId and targetId required" },
      { status: 400 }
    );
  }
  if (playerId === targetId) {
    return NextResponse.json(
      { error: "can't investigate yourself" },
      { status: 400 }
    );
  }

  const { data: room } = await supabaseAdmin
    .from("rooms")
    .select("state, police_mode, police_id, imposter_ids, imposter_id")
    .eq("code", code)
    .maybeSingle();
  if (!room) {
    return NextResponse.json({ error: "room not found" }, { status: 404 });
  }
  if (!room.police_mode) {
    return NextResponse.json(
      { error: "police mode is off" },
      { status: 400 }
    );
  }
  if (room.police_id !== playerId) {
    return NextResponse.json({ error: "not the cop" }, { status: 403 });
  }
  if (room.state !== "playing" && room.state !== "voting") {
    return NextResponse.json(
      { error: "investigations only during clue or vote phase" },
      { status: 400 }
    );
  }

  // Verify target exists in the room.
  const { data: target } = await supabaseAdmin
    .from("players")
    .select("id")
    .eq("id", targetId)
    .eq("room_code", code)
    .maybeSingle();
  if (!target) {
    return NextResponse.json(
      { error: "target not in this room" },
      { status: 404 }
    );
  }

  // Idempotent: if we've already investigated, return the cached result
  // without changing it. The cop locks in their first pick.
  const { data: me } = await supabaseAdmin
    .from("players")
    .select("investigated_id")
    .eq("id", playerId)
    .maybeSingle();
  const existing = (me?.investigated_id as string | null) ?? null;
  const lockedTarget = existing ?? targetId;

  if (!existing) {
    await supabaseAdmin
      .from("players")
      .update({ investigated_id: targetId })
      .eq("id", playerId);
    await notifyRoom(code, "investigated");
  }

  const imposterIds: string[] = Array.isArray(room.imposter_ids)
    ? (room.imposter_ids as string[]).filter(Boolean)
    : room.imposter_id
      ? [room.imposter_id as string]
      : [];

  return NextResponse.json({
    ok: true,
    targetId: lockedTarget,
    isImposter: imposterIds.includes(lockedTarget),
    alreadyUsed: !!existing,
  });
}
