import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { notifyRoom } from "@/lib/room-state";
import { placeTower } from "@/games/hold/state";
import type { Cell, HoldState, TowerType } from "@/games/hold/types";

// POST /api/rooms/[code]/hold/place
// Body: { playerId, type, cell }
// Places a tower on the shared board during planning. The engine
// returns the prior state unchanged on an invalid placement (off the
// path-free grid, occupied cell, not enough supply) — we detect that
// and return a clean 400.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code: raw } = await params;
  const code = raw.toUpperCase();
  const { playerId, type, cell } = (await request.json()) as {
    playerId?: string;
    type?: TowerType;
    cell?: Cell;
  };
  if (
    !playerId ||
    !type ||
    !cell ||
    typeof cell.x !== "number" ||
    typeof cell.y !== "number"
  ) {
    return NextResponse.json(
      { error: "playerId, type and cell required" },
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

  const next = placeTower(state, playerId, type, cell);
  if (next === state) {
    return NextResponse.json(
      { error: "invalid placement" },
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
  await notifyRoom(code, "hold_place");
  return NextResponse.json({ ok: true });
}
