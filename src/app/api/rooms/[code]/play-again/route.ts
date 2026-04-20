import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { notifyRoom } from "@/lib/room-state";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code: raw } = await params;
  const code = raw.toUpperCase();
  const { playerId } = (await request.json()) as { playerId?: string };
  if (!playerId) {
    return NextResponse.json({ error: "playerId required" }, { status: 400 });
  }

  const { data: room, error: roomErr } = await supabaseAdmin
    .from("rooms")
    .select("*")
    .eq("code", code)
    .maybeSingle();

  if (roomErr) {
    return NextResponse.json({ error: roomErr.message }, { status: 500 });
  }
  if (!room) {
    return NextResponse.json({ error: "room not found" }, { status: 404 });
  }
  if (room.host_id !== playerId) {
    return NextResponse.json(
      { error: "only host can restart" },
      { status: 403 }
    );
  }
  if (room.state !== "reveal") {
    return NextResponse.json({ error: "not in reveal" }, { status: 400 });
  }

  await Promise.all([
    supabaseAdmin.from("clues").delete().eq("room_code", code),
    supabaseAdmin.from("votes").delete().eq("room_code", code),
    // Pot was already settled on chain during reveal; clear the per-player
    // ante state so the next round can be re-anted.
    supabaseAdmin
      .from("players")
      .update({ ante_tx: null })
      .eq("room_code", code),
  ]);

  const update: Record<string, unknown> = {
    state: "lobby",
    category: null,
    secret_word: null,
    imposter_id: null,
    round: 0,
    turn_index: 0,
    turn_order: [],
    phase_deadline: null,
    updated_at: new Date().toISOString(),
  };
  if ("imposter_guess" in room) update.imposter_guess = null;
  if ("guess_outcome" in room) update.guess_outcome = null;
  if ("prewarm_word" in room) {
    update.prewarm_word = null;
    update.prewarm_category = null;
    update.prewarm_started_at = null;
  }
  // Pot toggle resets each match; host has to explicitly re-enable for
  // the next round so nobody gets charged by surprise.
  if ("pot_enabled" in room) {
    update.pot_enabled = false;
    update.ante_amount = null;
    update.chain_game_id = null;
    update.chain_create_tx = null;
    update.chain_resolve_tx = null;
  }

  const { error: updErr } = await supabaseAdmin
    .from("rooms")
    .update(update)
    .eq("code", code);

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  await notifyRoom(code, "restarted");

  return NextResponse.json({ ok: true });
}
