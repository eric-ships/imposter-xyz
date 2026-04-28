import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { notifyRoom } from "@/lib/room-state";

// Themed for the game: sus / nailed it / funny. Old reactions stored
// under the previous emoji set are still rendered (they just can't be
// added/toggled anymore).
const ALLOWED_EMOJI = new Set(["🚩", "🎯", "😂"]);

/**
 * Toggle a reaction. POST adds, second POST with the same emoji removes.
 * Idempotent on repeat clicks.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string; clueId: string }> }
) {
  const { code: raw, clueId: clueIdRaw } = await params;
  const code = raw.toUpperCase();
  const clueId = Number(clueIdRaw);
  if (!Number.isFinite(clueId)) {
    return NextResponse.json({ error: "bad clue id" }, { status: 400 });
  }
  const { playerId, emoji } = (await request.json()) as {
    playerId?: string;
    emoji?: string;
  };
  if (!playerId || !emoji) {
    return NextResponse.json(
      { error: "playerId and emoji required" },
      { status: 400 }
    );
  }
  if (!ALLOWED_EMOJI.has(emoji)) {
    return NextResponse.json({ error: "emoji not allowed" }, { status: 400 });
  }

  // Verify this clue belongs to the room and the requester is a player.
  const [{ data: clue }, { data: player }] = await Promise.all([
    supabaseAdmin
      .from("clues")
      .select("id, room_code")
      .eq("id", clueId)
      .maybeSingle(),
    supabaseAdmin
      .from("players")
      .select("id, room_code")
      .eq("id", playerId)
      .maybeSingle(),
  ]);
  if (!clue || clue.room_code !== code) {
    return NextResponse.json({ error: "clue not found" }, { status: 404 });
  }
  if (!player || player.room_code !== code) {
    return NextResponse.json(
      { error: "not a player in this room" },
      { status: 403 }
    );
  }

  // Toggle: if already exists, delete; else insert.
  const { data: existing } = await supabaseAdmin
    .from("clue_reactions")
    .select("clue_id")
    .eq("clue_id", clueId)
    .eq("player_id", playerId)
    .eq("emoji", emoji)
    .maybeSingle();

  if (existing) {
    await supabaseAdmin
      .from("clue_reactions")
      .delete()
      .eq("clue_id", clueId)
      .eq("player_id", playerId)
      .eq("emoji", emoji);
  } else {
    await supabaseAdmin
      .from("clue_reactions")
      .insert({ clue_id: clueId, player_id: playerId, emoji });
  }

  await notifyRoom(code, "reaction");
  return NextResponse.json({ ok: true });
}
