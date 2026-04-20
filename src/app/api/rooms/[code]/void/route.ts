import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { notifyRoom } from "@/lib/room-state";
import { refundPot } from "@/lib/settle";

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
      { error: "only host can void" },
      { status: 403 }
    );
  }
  if (room.state === "lobby") {
    return NextResponse.json({ error: "nothing to void" }, { status: 400 });
  }

  // Refund any antes that were paid before we wipe round state.
  await refundPot({ code, ...room });

  // Wipe round artifacts but keep player scores intact.
  await Promise.all([
    supabaseAdmin.from("clues").delete().eq("room_code", code),
    supabaseAdmin.from("votes").delete().eq("room_code", code),
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
    updated_at: new Date().toISOString(),
  };
  if ("phase_deadline" in room) update.phase_deadline = null;
  if ("imposter_ids" in room) update.imposter_ids = [];
  if ("caught_imposter_id" in room) update.caught_imposter_id = null;
  if ("imposter_guess" in room) update.imposter_guess = null;
  if ("guess_outcome" in room) update.guess_outcome = null;
  if ("prewarm_word" in room) {
    update.prewarm_word = null;
    update.prewarm_category = null;
    update.prewarm_started_at = null;
  }
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

  await notifyRoom(code, "voided");

  return NextResponse.json({ ok: true });
}
