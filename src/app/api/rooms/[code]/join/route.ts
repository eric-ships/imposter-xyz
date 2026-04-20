import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { notifyRoom } from "@/lib/room-state";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code: raw } = await params;
  const code = raw.toUpperCase();
  const { nickname } = (await request.json()) as { nickname?: string };
  const trimmed = nickname?.trim();
  if (!trimmed) {
    return NextResponse.json({ error: "nickname required" }, { status: 400 });
  }

  const { data: room } = await supabaseAdmin
    .from("rooms")
    .select("code, state")
    .eq("code", code)
    .maybeSingle();

  if (!room) {
    return NextResponse.json({ error: "room not found" }, { status: 404 });
  }
  if (room.state !== "lobby") {
    return NextResponse.json(
      { error: "game already started" },
      { status: 400 }
    );
  }

  const { count: playerCount } = await supabaseAdmin
    .from("players")
    .select("id", { count: "exact", head: true })
    .eq("room_code", code);
  if ((playerCount ?? 0) >= 4) {
    return NextResponse.json(
      { error: "room is full · 4 players max" },
      { status: 400 }
    );
  }

  const { data: player, error } = await supabaseAdmin
    .from("players")
    .insert({ room_code: code, nickname: trimmed })
    .select("id")
    .single();

  if (error || !player) {
    return NextResponse.json(
      { error: error?.message ?? "join failed" },
      { status: 500 }
    );
  }

  await notifyRoom(code, "player_joined");

  return NextResponse.json({ playerId: player.id });
}
