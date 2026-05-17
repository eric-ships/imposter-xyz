import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { notifyRoom } from "@/lib/room-state";

// POST /api/rooms/[code]/switch-kind
// Body: { playerId, kind }
// Lobby-only, host-only. Switches the room's game type in place so
// the host doesn't have to make everyone leave and join a new room.
// Resets game_state (it's per-game-shaped) but preserves players
// and match_history (the history union already handles both kinds).
//
// Refuses if pot is enabled and any player has already anted — same
// rule as kick. Host should disable pot or settle refunds first.

const VALID_KINDS = new Set([
  "imposter",
  "wavelength",
  "just-one",
  "crew",
  "hold",
]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code: raw } = await params;
  const code = raw.toUpperCase();
  const { playerId, kind } = (await request.json()) as {
    playerId?: string;
    kind?: string;
  };
  if (!playerId || !kind) {
    return NextResponse.json(
      { error: "playerId and kind required" },
      { status: 400 }
    );
  }
  if (!VALID_KINDS.has(kind)) {
    return NextResponse.json({ error: "unknown kind" }, { status: 400 });
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
      { error: "only the host can switch games" },
      { status: 403 }
    );
  }
  if (room.state !== "lobby") {
    return NextResponse.json(
      { error: "can only switch in the lobby" },
      { status: 400 }
    );
  }

  const currentKind = ("kind" in room ? room.kind : "imposter") as string;
  if (currentKind === kind) {
    return NextResponse.json({ ok: true, changed: false });
  }

  // Pot-safety check (parallel to /kick): if any player has paid an
  // ante on chain, switching kinds would orphan their stake. Force
  // host to disable pot first.
  if ("pot_enabled" in room && room.pot_enabled) {
    const { data: anted } = await supabaseAdmin
      .from("players")
      .select("id")
      .eq("room_code", code)
      .not("ante_tx", "is", null)
      .limit(1);
    if (anted && anted.length > 0) {
      return NextResponse.json(
        {
          error:
            "antes paid · disable pot or refund before switching games",
        },
        { status: 400 }
      );
    }
  }

  // Reset game-specific lobby toggles + scratch state so the new game
  // starts from a clean slate. Players + match_history persist.
  const update: Record<string, unknown> = {
    kind,
    game_state: {},
    updated_at: new Date().toISOString(),
  };
  // Clear imposter-specific lobby toggles when leaving imposter.
  if (currentKind === "imposter") {
    if ("mole_mode" in room) update.mole_mode = false;
    if ("jesus_mode" in room) update.jesus_mode = false;
    if ("police_mode" in room) update.police_mode = false;
    if ("pot_enabled" in room) {
      update.pot_enabled = false;
      update.ante_amount = null;
    }
  }

  const { error: updErr } = await supabaseAdmin
    .from("rooms")
    .update(update)
    .eq("code", code);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  await notifyRoom(code, "kind_switched");
  return NextResponse.json({ ok: true, changed: true });
}
