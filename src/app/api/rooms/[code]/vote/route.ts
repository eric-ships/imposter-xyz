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
  const imposterIds: string[] = Array.isArray(room.imposter_ids)
    ? (room.imposter_ids as string[]).filter(Boolean)
    : room.imposter_id
      ? [room.imposter_id as string]
      : [];
  // Crew wins by catching at least one imposter as the plurality target.
  // A tie counts as a catch only if EVERY top-tied target is an imposter
  // (e.g. a 2-2 split between the two imposters in a 5-player room): the
  // table correctly fingered the imposter team, even if they couldn't pick
  // one. We caught the first listed and proceed to the guess phase.
  const allTopAreImposters =
    topTargets.length > 0 &&
    topTargets.every((id) => imposterIds.includes(id));
  const caughtImposterId = allTopAreImposters ? topTargets[0] : null;

  if (!caughtImposterId) {
    // Imposter team escaped. Each imposter gets +2; reset everyone
    // else's last_round_delta to 0 so a stale +N from a prior match
    // doesn't linger on the scoreboard badge.
    await supabaseAdmin
      .from("players")
      .update({ last_round_delta: 0 })
      .eq("room_code", code);
    for (const impId of imposterIds) {
      const { data: current } = await supabaseAdmin
        .from("players")
        .select("score")
        .eq("id", impId)
        .single();
      await supabaseAdmin
        .from("players")
        .update({
          score: (current?.score ?? 0) + 2,
          last_round_delta: 2,
        })
        .eq("id", impId);
    }

    // Settle pot on chain. Imposter team takes everything (split evenly).
    await settlePot(
      { code, ...room },
      {
        imposterIds,
        caught: false,
        tied,
        guessOutcome: null,
      }
    );

    const revealUpdate: Record<string, unknown> = {
      state: "reveal",
      updated_at: new Date().toISOString(),
    };
    if ("phase_deadline" in room) revealUpdate.phase_deadline = null;
    await supabaseAdmin.from("rooms").update(revealUpdate).eq("code", code);

    await notifyRoom(code, "revealed");
    return NextResponse.json({ ok: true });
  }

  // That imposter was caught. Only they go to guess phase.
  const guessUpdate: Record<string, unknown> = {
    state: "guessing",
    updated_at: new Date().toISOString(),
  };
  if ("phase_deadline" in room) {
    guessUpdate.phase_deadline = deadlineFor("guessing");
  }
  if ("caught_imposter_id" in room) {
    guessUpdate.caught_imposter_id = caughtImposterId;
  }
  await supabaseAdmin.from("rooms").update(guessUpdate).eq("code", code);

  await notifyRoom(code, "guessing_started");
  return NextResponse.json({ ok: true });
}
