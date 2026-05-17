import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { notifyRoom } from "@/lib/room-state";
import { allReady, resolveWave, setReady } from "@/games/hold/state";
import type { HoldState } from "@/games/hold/types";

// POST /api/rooms/[code]/hold/ready
// Body: { playerId, ready }
// Flips a player's "done planning" flag. When the last player readies
// up, the wave resolves immediately (planning → reveal) so the client
// can replay the simulation.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code: raw } = await params;
  const code = raw.toUpperCase();
  const { playerId, ready } = (await request.json()) as {
    playerId?: string;
    ready?: boolean;
  };
  if (!playerId || typeof ready !== "boolean") {
    return NextResponse.json(
      { error: "playerId and ready required" },
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

  const readied = setReady(state, playerId, ready);
  if (readied === state) {
    return NextResponse.json(
      { error: "invalid ready" },
      { status: 400 }
    );
  }

  // The last player to ready up resolves the wave right away.
  const next = allReady(readied) ? resolveWave(readied) : readied;

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
  await notifyRoom(code, "hold_ready");
  return NextResponse.json({ ok: true });
}
