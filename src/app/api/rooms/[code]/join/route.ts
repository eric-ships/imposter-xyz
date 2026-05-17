import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { notifyRoom } from "@/lib/room-state";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code: raw } = await params;
  const code = raw.toUpperCase();
  const { nickname, userId } = (await request.json()) as {
    nickname?: string;
    userId?: string;
  };
  const trimmedUserId = userId?.trim() || null;

  const { data: room } = await supabaseAdmin
    .from("rooms")
    .select("code, state")
    .eq("code", code)
    .maybeSingle();

  if (!room) {
    return NextResponse.json({ error: "room not found" }, { status: 404 });
  }

  // One-identity: the player's nickname + avatar are a snapshot of the
  // caller's authored users identity, not typed fresh per room. A
  // `nickname` in the body is accepted only as a fallback for callers
  // that haven't stopped sending it.
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

  // Reclaim by user_id first: if the same device already has a
  // player row in this room, return it. Cleanest path — survives
  // nickname changes within a session ("oh I want to be Alice
  // instead of alice123") without orphaning the original row.
  if (trimmedUserId) {
    const { data: byUser } = await supabaseAdmin
      .from("players")
      .select("id")
      .eq("room_code", code)
      .eq("user_id", trimmedUserId)
      .maybeSingle();
    if (byUser) {
      await notifyRoom(code, "player_rejoined");
      return NextResponse.json({
        playerId: byUser.id,
        rejoined: true,
      });
    }
  }

  // Fallback reclaim by nickname: case-insensitive match. Lets
  // someone who lost localStorage (cleared cache, switched device,
  // closed the tab mid-game) come back by typing the same name —
  // works in both lobby and active phases. Lazy-backfill: if the
  // matched row has no user_id and we have one, bind it now.
  const { data: existing } = await supabaseAdmin
    .from("players")
    .select("id, nickname, user_id")
    .eq("room_code", code)
    .ilike("nickname", trimmed)
    .maybeSingle();
  if (existing) {
    if (
      trimmedUserId &&
      !(existing as { user_id?: string | null }).user_id
    ) {
      await supabaseAdmin
        .from("players")
        .update({ user_id: trimmedUserId })
        .eq("id", existing.id);
    }
    await notifyRoom(code, "player_rejoined");
    return NextResponse.json({ playerId: existing.id, rejoined: true });
  }

  // Fresh join: only allowed in the lobby. After start, no new
  // participants — the seat assignments and roles are baked in.
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
  if ((playerCount ?? 0) >= 8) {
    return NextResponse.json(
      { error: "room is full · 8 players max" },
      { status: 400 }
    );
  }

  const insertRow: Record<string, unknown> = {
    room_code: code,
    nickname: trimmed,
  };
  if (trimmedUserId) insertRow.user_id = trimmedUserId;
  if (identityAvatar) insertRow.avatar = identityAvatar;
  const { data: player, error } = await supabaseAdmin
    .from("players")
    .insert(insertRow)
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
