import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { notifyRoom } from "@/lib/room-state";

/**
 * Host-only: toggle "moley moley mole" mode in the lobby. Imposters
 * know each other; crewmates pair up at start. Lobby-only because the
 * pairings get baked in at /start; flipping mid-game would mean the
 * room state already reflects whichever mode was active.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code: raw } = await params;
  const code = raw.toUpperCase();
  const { playerId, enabled } = (await request.json()) as {
    playerId?: string;
    enabled?: boolean;
  };
  if (!playerId || typeof enabled !== "boolean") {
    return NextResponse.json(
      { error: "playerId and enabled required" },
      { status: 400 }
    );
  }

  const { data: room, error: roomErr } = await supabaseAdmin
    .from("rooms")
    .select("host_id, state")
    .eq("code", code)
    .maybeSingle();
  if (roomErr)
    return NextResponse.json({ error: roomErr.message }, { status: 500 });
  if (!room)
    return NextResponse.json({ error: "room not found" }, { status: 404 });
  if (room.host_id !== playerId)
    return NextResponse.json({ error: "only host" }, { status: 403 });
  if (room.state !== "lobby")
    return NextResponse.json({ error: "lobby only" }, { status: 400 });

  const { error: updErr } = await supabaseAdmin
    .from("rooms")
    .update({
      mole_mode: enabled,
      updated_at: new Date().toISOString(),
    })
    .eq("code", code);
  if (updErr)
    return NextResponse.json({ error: updErr.message }, { status: 500 });

  await notifyRoom(code, enabled ? "mole_mode_on" : "mole_mode_off");
  return NextResponse.json({ ok: true });
}
