import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { notifyRoom } from "@/lib/room-state";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code: raw } = await params;
  const code = raw.toUpperCase();
  const { playerId, targetId } = (await request.json()) as {
    playerId?: string;
    targetId?: string;
  };
  if (!playerId || !targetId) {
    return NextResponse.json(
      { error: "playerId and targetId required" },
      { status: 400 }
    );
  }

  const { data: room } = await supabaseAdmin
    .from("rooms")
    .select("*")
    .eq("code", code)
    .maybeSingle();

  if (!room) {
    return NextResponse.json({ error: "room not found" }, { status: 404 });
  }
  if (room.state !== "voting") {
    return NextResponse.json({ error: "not in voting phase" }, { status: 400 });
  }

  const { error: voteErr } = await supabaseAdmin
    .from("votes")
    .upsert(
      { room_code: code, voter_id: playerId, target_id: targetId },
      { onConflict: "room_code,voter_id" }
    );
  if (voteErr) {
    return NextResponse.json({ error: voteErr.message }, { status: 500 });
  }

  // Check if everyone has voted.
  const { data: players } = await supabaseAdmin
    .from("players")
    .select("id")
    .eq("room_code", code);
  const { data: votes } = await supabaseAdmin
    .from("votes")
    .select("voter_id, target_id")
    .eq("room_code", code);

  const totalPlayers = players?.length ?? 0;
  const totalVotes = votes?.length ?? 0;

  if (totalVotes >= totalPlayers) {
    // Tally. Plurality wins; tie = no catch.
    const counts = new Map<string, number>();
    for (const v of votes ?? []) {
      counts.set(v.target_id, (counts.get(v.target_id) ?? 0) + 1);
    }
    let topTarget: string | null = null;
    let topCount = 0;
    let tied = false;
    for (const [id, n] of counts) {
      if (n > topCount) {
        topTarget = id;
        topCount = n;
        tied = false;
      } else if (n === topCount) {
        tied = true;
      }
    }

    const imposterCaught = !tied && topTarget === room.imposter_id;

    // Scoring: if imposter caught, every non-imposter gets +1. Otherwise
    // imposter gets +2.
    if (imposterCaught) {
      const nonImposterIds =
        players?.filter((p) => p.id !== room.imposter_id).map((p) => p.id) ??
        [];
      if (nonImposterIds.length > 0) {
        // Increment scores one by one (no bulk inc in PostgREST).
        for (const id of nonImposterIds) {
          const { data: current } = await supabaseAdmin
            .from("players")
            .select("score")
            .eq("id", id)
            .single();
          await supabaseAdmin
            .from("players")
            .update({ score: (current?.score ?? 0) + 1 })
            .eq("id", id);
        }
      }
    } else {
      const { data: current } = await supabaseAdmin
        .from("players")
        .select("score")
        .eq("id", room.imposter_id)
        .single();
      await supabaseAdmin
        .from("players")
        .update({ score: (current?.score ?? 0) + 2 })
        .eq("id", room.imposter_id);
    }

    await supabaseAdmin
      .from("rooms")
      .update({ state: "reveal", updated_at: new Date().toISOString() })
      .eq("code", code);

    await notifyRoom(code, "revealed");
  } else {
    await notifyRoom(code, "vote_cast");
  }

  return NextResponse.json({ ok: true });
}
