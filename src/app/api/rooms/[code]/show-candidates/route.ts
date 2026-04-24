import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { notifyRoom } from "@/lib/room-state";

/**
 * Host-only: toggle the "show guess candidates throughout the match"
 * casual mode. Allowed in any phase — turning it on mid-game triggers
 * the client-side fallback to fetch + cache candidates; turning it off
 * just hides the showcase.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code: raw } = await params;
  const code = raw.toUpperCase();
  const { playerId, enabled } = (await request.json()) as {
    playerId?: string;
    enabled?: boolean;
  };
  if (!playerId || typeof enabled !== "boolean") {
    return NextResponse.json(
      { error: "playerId and enabled required" },
      { status: 400 }
    );
  }

  const { data: room, error: roomErr } = await supabaseAdmin
    .from("rooms")
    .select("host_id, state")
    .eq("code", code)
    .maybeSingle();
  if (roomErr)
    return NextResponse.json({ error: roomErr.message }, { status: 500 });
  if (!room)
    return NextResponse.json({ error: "room not found" }, { status: 404 });
  if (room.host_id !== playerId)
    return NextResponse.json({ error: "only host" }, { status: 403 });

  const { error: updErr } = await supabaseAdmin
    .from("rooms")
    .update({
      show_candidates_always: enabled,
      updated_at: new Date().toISOString(),
    })
    .eq("code", code);
  if (updErr)
    return NextResponse.json({ error: updErr.message }, { status: 500 });

  await notifyRoom(
    code,
    enabled ? "candidates_mode_on" : "candidates_mode_off"
  );
  return NextResponse.json({ ok: true });
}
