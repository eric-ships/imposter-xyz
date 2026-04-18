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

  const { data: room } = await supabaseAdmin
    .from("rooms")
    .select("code, host_id, state")
    .eq("code", code)
    .maybeSingle();

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
  ]);

  await supabaseAdmin
    .from("rooms")
    .update({
      state: "lobby",
      category: null,
      secret_word: null,
      imposter_id: null,
      round: 0,
      turn_index: 0,
      turn_order: [],
      imposter_guess: null,
      guess_outcome: null,
      updated_at: new Date().toISOString(),
    })
    .eq("code", code);

  await notifyRoom(code, "restarted");

  return NextResponse.json({ ok: true });
}
