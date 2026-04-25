import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { notifyRoom } from "@/lib/room-state";

/**
 * Set or clear a player's emoji avatar. Pass `avatar: null` to fall back
 * to the nickname-initial default.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code: raw } = await params;
  const code = raw.toUpperCase();
  const { playerId, avatar } = (await request.json()) as {
    playerId?: string;
    avatar?: string | null;
  };
  if (!playerId) {
    return NextResponse.json({ error: "playerId required" }, { status: 400 });
  }

  // Sanitize: strip whitespace, cap at 8 chars (an emoji can be multiple
  // codepoints — flag emoji are 8 bytes utf-8). Empty string -> null.
  const cleaned =
    typeof avatar === "string" && avatar.trim().length > 0
      ? avatar.trim().slice(0, 8)
      : null;

  const { data: player, error: fetchErr } = await supabaseAdmin
    .from("players")
    .select("id, room_code")
    .eq("id", playerId)
    .maybeSingle();
  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!player || player.room_code !== code) {
    return NextResponse.json(
      { error: "not a player in this room" },
      { status: 403 }
    );
  }

  const { error: updErr } = await supabaseAdmin
    .from("players")
    .update({ avatar: cleaned })
    .eq("id", playerId);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  await notifyRoom(code, "avatar_changed");
  return NextResponse.json({ ok: true });
}
