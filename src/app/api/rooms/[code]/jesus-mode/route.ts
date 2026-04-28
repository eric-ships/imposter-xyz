import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { notifyRoom } from "@/lib/room-state";

/**
 * Host-only: toggle "jesus christ" mode in the lobby. 1 imposter who
 * knows one randomly-chosen crewmate ("their jesus"). Lobby-only since
 * the assignment is baked in at /start.
 *
 * Turning this ON also turns OFF mole_mode (the two are mutually
 * exclusive: jesus is a single-imposter mode; mole is multi-imposter).
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

  const update: Record<string, unknown> = {
    jesus_mode: enabled,
    updated_at: new Date().toISOString(),
  };
  // Mutually exclusive with mole mode.
  if (enabled) update.mole_mode = false;

  const { error: updErr } = await supabaseAdmin
    .from("rooms")
    .update(update)
    .eq("code", code);
  if (updErr)
    return NextResponse.json({ error: updErr.message }, { status: 500 });

  await notifyRoom(code, enabled ? "jesus_mode_on" : "jesus_mode_off");
  return NextResponse.json({ ok: true });
}
