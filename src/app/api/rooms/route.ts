import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { generateRoomCode } from "@/lib/room-code";

export async function POST(request: Request) {
  const { nickname } = (await request.json()) as { nickname?: string };
  const trimmed = nickname?.trim();
  if (!trimmed) {
    return NextResponse.json({ error: "nickname required" }, { status: 400 });
  }

  let code = "";
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = generateRoomCode(4);
    const { data: existing } = await supabaseAdmin
      .from("rooms")
      .select("code")
      .eq("code", candidate)
      .maybeSingle();
    if (!existing) {
      code = candidate;
      break;
    }
  }
  if (!code) {
    return NextResponse.json(
      { error: "could not allocate room code" },
      { status: 500 }
    );
  }

  const hostId = randomUUID();

  const { error: roomErr } = await supabaseAdmin
    .from("rooms")
    .insert({ code, host_id: hostId });
  if (roomErr) {
    return NextResponse.json({ error: roomErr.message }, { status: 500 });
  }

  const { error: playerErr } = await supabaseAdmin
    .from("players")
    .insert({ id: hostId, room_code: code, nickname: trimmed });
  if (playerErr) {
    return NextResponse.json({ error: playerErr.message }, { status: 500 });
  }

  await supabaseAdmin
    .from("room_events")
    .insert({ room_code: code, kind: "room_created" });

  return NextResponse.json({ code, playerId: hostId });
}
