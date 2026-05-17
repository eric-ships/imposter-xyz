import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { notifyRoom } from "@/lib/room-state";
import { upgradeTower } from "@/games/hold/state";
import type { HoldState } from "@/games/hold/types";

// POST /api/rooms/[code]/hold/upgrade
// Body: { playerId, towerId }
// Upgrades one of your own towers to level 2 during planning. The
// engine returns the prior state unchanged on an invalid action (not
// your tower, already maxed, not enough supply) — detected here as a
// clean 400.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code: raw } = await params;
  const code = raw.toUpperCase();
  const { playerId, towerId } = (await request.json()) as {
    playerId?: string;
    towerId?: string;
  };
  if (!playerId || !towerId) {
    return NextResponse.json(
      { error: "playerId and towerId required" },
      { status: 400 }
    );
  }

  const { data: room } = await supabaseAdmin
    .from("rooms")
    .select("kind, game_state")
    .eq("code", code)
    .maybeSingle();
  if (!room || room.kind !== "hold") {
    return NextResponse.json(
      { error: "hold room not found" },
      { status: 404 }
    );
  }
  const state = room.game_state as HoldState | null;
  if (!state) {
    return NextResponse.json(
      { error: "no match in progress" },
      { status: 400 }
    );
  }

  const next = upgradeTower(state, playerId, towerId);
  if (next === state) {
    return NextResponse.json(
      { error: "invalid upgrade" },
      { status: 400 }
    );
  }

  const { error: updErr } = await supabaseAdmin
    .from("rooms")
    .update({
      game_state: next,
      updated_at: new Date().toISOString(),
    })
    .eq("code", code);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }
  await notifyRoom(code, "hold_upgrade");
  return NextResponse.json({ ok: true });
}
