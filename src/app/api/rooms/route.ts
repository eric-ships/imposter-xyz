import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { generateRoomCode } from "@/lib/room-code";

// Whitelist of game kinds the create-room endpoint will accept. Keep
// in lockstep with GameKind in @/lib/game. Anything not in this list
// (or omitted) falls back to imposter so existing clients keep working.
const VALID_KINDS = new Set([
  "imposter",
  "wavelength",
  "just-one",
  "crew",
  "hold",
]);

export async function POST(request: Request) {
  const { nickname, kind, userId, groupId } = (await request.json()) as {
    nickname?: string;
    kind?: string;
    userId?: string;
    groupId?: string;
  };
  const roomKind = kind && VALID_KINDS.has(kind) ? kind : "imposter";
  const trimmedUserId = userId?.trim() || null;
  const trimmedGroupId = groupId?.trim() || null;

  // One-identity: the player's nickname + avatar are a snapshot of the
  // caller's authored users identity, not typed fresh per room. Look
  // them up from the users row. A `nickname` in the body is accepted
  // only as a fallback for callers that haven't stopped sending it.
  let identityNickname: string | null = null;
  let identityAvatar: string | null = null;
  if (trimmedUserId) {
    const { data: user } = await supabaseAdmin
      .from("users")
      .select("default_nickname, default_avatar")
      .eq("id", trimmedUserId)
      .maybeSingle();
    identityNickname = user?.default_nickname?.trim() || null;
    identityAvatar = user?.default_avatar?.trim() || null;
  }
  const trimmed = identityNickname ?? nickname?.trim() ?? null;
  if (!trimmed) {
    return NextResponse.json({ error: "nickname required" }, { status: 400 });
  }

  // Validate group membership at attribution time. Same rule as
  // /api/rooms/[code]/attribute — host must be a member.
  if (trimmedGroupId) {
    if (!trimmedUserId) {
      return NextResponse.json(
        { error: "userId required to attribute to a group" },
        { status: 400 }
      );
    }
    const { data: membership } = await supabaseAdmin
      .from("group_members")
      .select("group_id")
      .eq("group_id", trimmedGroupId)
      .eq("user_id", trimmedUserId)
      .maybeSingle();
    if (!membership) {
      return NextResponse.json(
        { error: "you're not a member of that group" },
        { status: 403 }
      );
    }
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
  if (trimmedGroupId) insertRow.group_id = trimmedGroupId;
  const { error: roomErr } = await supabaseAdmin
    .from("rooms")
    .insert(insertRow);
  if (roomErr) {
    return NextResponse.json({ error: roomErr.message }, { status: 500 });
  }

  // Bind to user_id if the client passed one (identity layer
  // bootstraps it from localStorage). Pre-migration DBs without the
  // column don't get the field set; we only include it when present.
  // nickname/avatar are denormalized snapshots of the user identity.
  const playerRow: Record<string, unknown> = {
    id: hostId,
    room_code: code,
    nickname: trimmed,
  };
  if (trimmedUserId) playerRow.user_id = trimmedUserId;
  if (identityAvatar) playerRow.avatar = identityAvatar;
  const { error: playerErr } = await supabaseAdmin
    .from("players")
    .insert(playerRow);
  if (playerErr) {
    return NextResponse.json({ error: playerErr.message }, { status: 500 });
  }

  await supabaseAdmin
    .from("room_events")
    .insert({ room_code: code, kind: "room_created" });

  return NextResponse.json({ code, playerId: hostId });
}
