import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { generateRoomCode } from "@/lib/room-code";

// POST /api/discord/activity/room
// Body: { instanceId } — the Discord Activity instance id.
//
// Find-or-create the single room shared by an Activity instance:
// everyone who launches the Activity in the same voice channel lands
// in the same room. The room opens host-less; the first player to
// join inherits the host seat (see /api/rooms/[code]/join).
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    instanceId?: string;
  };
  const instanceId = body.instanceId?.trim();
  if (!instanceId) {
    return NextResponse.json(
      { error: "instanceId required" },
      { status: 400 }
    );
  }

  // Already have a room for this instance? Return it.
  const { data: existing } = await supabaseAdmin
    .from("rooms")
    .select("code")
    .eq("discord_instance_id", instanceId)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ code: existing.code });
  }

  // Allocate a fresh, unused room code.
  let code = "";
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = generateRoomCode(4);
    const { data: clash } = await supabaseAdmin
      .from("rooms")
      .select("code")
      .eq("code", candidate)
      .maybeSingle();
    if (!clash) {
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

  const { error } = await supabaseAdmin.from("rooms").insert({
    code,
    host_id: randomUUID(), // points at no player; first joiner claims it
    show_candidates_always: true,
    discord_instance_id: instanceId,
  });
  if (error) {
    // Lost a create race — the unique index on discord_instance_id
    // rejected this insert. Re-read whichever room won.
    const { data: winner } = await supabaseAdmin
      .from("rooms")
      .select("code")
      .eq("discord_instance_id", instanceId)
      .maybeSingle();
    if (winner) return NextResponse.json({ code: winner.code });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabaseAdmin
    .from("room_events")
    .insert({ room_code: code, kind: "room_created" });
  return NextResponse.json({ code });
}
