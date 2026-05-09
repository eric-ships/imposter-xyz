import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { generateRoomCode } from "@/lib/room-code";

// Whitelist of game kinds the create-room endpoint will accept. Keep
// in lockstep with GameKind in @/lib/game. Anything not in this list
// (or omitted) falls back to imposter so existing clients keep working.
const VALID_KINDS = new Set(["imposter", "wavelength", "just-one"]);

export async function POST(request: Request) {
  const { nickname, kind } = (await request.json()) as {
    nickname?: string;
    kind?: string;
  };
  const trimmed = nickname?.trim();
  if (!trimmed) {
    return NextResponse.json({ error: "nickname required" }, { status: 400 });
  }
  const roomKind = kind && VALID_KINDS.has(kind) ? kind : "imposter";

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

  // Default new rooms to shortlist mode (show_candidates_always = true).
  // Hosts can flip it off in the lobby or via the header pill mid-game.
  // Only pass `kind` when it's a non-default value so pre-migration
  // databases (no kind column yet) keep working for imposter rooms.
  // Wavelength still requires the migration; that's enforced by the
  // failure of this insert on a pre-migration DB, which is correct.
  const insertRow: Record<string, unknown> = {
    code,
    host_id: hostId,
    show_candidates_always: true,
  };
  if (roomKind !== "imposter") insertRow.kind = roomKind;
  const { error: roomErr } = await supabaseAdmin
    .from("rooms")
    .insert(insertRow);
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
