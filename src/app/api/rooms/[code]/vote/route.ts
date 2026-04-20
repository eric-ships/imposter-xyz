import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { notifyRoom, tallyVotes } from "@/lib/room-state";
import { settlePot } from "@/lib/settle";
import { deadlineFor } from "@/lib/timer";

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
    return NextResponse.json(
      { error: "not in voting phase" },
      { status: 400 }
    );
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

  if (totalVotes < totalPlayers) {
    await notifyRoom(code, "vote_cast");
    return NextResponse.json({ ok: true });
  }

  // Everyone has voted. Tally.
  const { topTargets, tied } = tallyVotes(votes ?? []);
  const imposterCaught = !tied && topTargets[0] === room.imposter_id;

  if (!imposterCaught) {
    // Imposter escaped. Award +2 and jump to reveal.
    const { data: current } = await supabaseAdmin
      .from("players")
      .select("score")
      .eq("id", room.imposter_id)
      .single();
    await supabaseAdmin
      .from("players")
      .update({ score: (current?.score ?? 0) + 2 })
      .eq("id", room.imposter_id);

    // Settle the pot on chain before flipping state. Imposter takes all.
    await settlePot(
      { code, ...room },
      {
        imposterId: room.imposter_id,
        caught: false,
        tied,
        guessOutcome: null,
      }
    );

    await supabaseAdmin
      .from("rooms")
      .update({
        state: "reveal",
        phase_deadline: null,
        updated_at: new Date().toISOString(),
      })
      .eq("code", code);

    await notifyRoom(code, "revealed");
    return NextResponse.json({ ok: true });
  }

  // Imposter was caught. Give them one chance to guess the word.
  await supabaseAdmin
    .from("rooms")
    .update({
      state: "guessing",
      phase_deadline: deadlineFor("guessing"),
      updated_at: new Date().toISOString(),
    })
    .eq("code", code);

  await notifyRoom(code, "guessing_started");
  return NextResponse.json({ ok: true });
}
