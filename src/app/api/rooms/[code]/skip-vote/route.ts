import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { notifyRoom } from "@/lib/room-state";
import { generateRound } from "@/lib/anthropic";

// Crewmates can vote to skip a bad secret word during the clue phase.
// Eligible only while state === "playing" and the current round has
// fewer than 2 clues submitted. A majority of crewmates triggers a
// fresh word + category draw. Imposters can't vote.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code: raw } = await params;
  const code = raw.toUpperCase();
  const { playerId } = (await request.json()) as { playerId?: string };
  if (!playerId) {
    return NextResponse.json({ error: "playerId required" }, { status: 400 });
  }

  const { data: room, error: roomErr } = await supabaseAdmin
    .from("rooms")
    .select("*")
    .eq("code", code)
    .maybeSingle();

  if (roomErr) {
    return NextResponse.json({ error: roomErr.message }, { status: 500 });
  }
  if (!room) {
    return NextResponse.json({ error: "room not found" }, { status: 404 });
  }
  // skip-the-word is an imposter-only mechanic.
  const kind = "kind" in room ? room.kind : "imposter";
  if (kind !== "imposter") {
    return NextResponse.json({ error: "room not found" }, { status: 404 });
  }
  if (room.state !== "playing") {
    return NextResponse.json({ error: "not in play phase" }, { status: 400 });
  }

  const { data: players, error: playersErr } = await supabaseAdmin
    .from("players")
    .select("id")
    .eq("room_code", code);

  if (playersErr) {
    return NextResponse.json({ error: playersErr.message }, { status: 500 });
  }
  if (!players || players.length === 0) {
    return NextResponse.json({ error: "room not found" }, { status: 404 });
  }

  const playerIds = players.map((p) => p.id as string);
  if (!playerIds.includes(playerId)) {
    return NextResponse.json(
      { error: "not a player in this room" },
      { status: 403 }
    );
  }

  // imposter_ids is the source of truth; fall back to [imposter_id].
  const imposterIds: string[] = Array.isArray(room.imposter_ids)
    ? (room.imposter_ids as string[]).filter(Boolean)
    : room.imposter_id
      ? [room.imposter_id as string]
      : [];
  if (imposterIds.includes(playerId)) {
    return NextResponse.json(
      { error: "imposters cannot vote to skip" },
      { status: 403 }
    );
  }

  // Skip is only allowed up until the 2nd clue of the round lands.
  const { count: clueCount, error: cluesErr } = await supabaseAdmin
    .from("clues")
    .select("id", { count: "exact", head: true })
    .eq("room_code", code)
    .eq("round", room.round);
  if (cluesErr) {
    return NextResponse.json({ error: cluesErr.message }, { status: 500 });
  }
  if ((clueCount ?? 0) >= 2) {
    return NextResponse.json(
      { error: "too late to skip this word" },
      { status: 400 }
    );
  }

  // Toggle this crewmate's vote.
  const current: string[] = Array.isArray(room.skip_votes)
    ? (room.skip_votes as string[]).filter(Boolean)
    : [];
  const alreadyVoted = current.includes(playerId);
  const nextVotes = alreadyVoted
    ? current.filter((id) => id !== playerId)
    : [...current, playerId];

  const crewmateCount = playerIds.length - imposterIds.length;
  const threshold = Math.ceil(crewmateCount / 2);

  if (nextVotes.length >= threshold) {
    // Skip lands — draw a fresh word + category.
    const hasRecentWords = "recent_words" in room;
    const hasRecentCategories = "recent_categories" in room;
    const recentWords: string[] = hasRecentWords
      ? (room.recent_words ?? [])
      : [];
    const recentCategories: string[] = hasRecentCategories
      ? (room.recent_categories ?? [])
      : [];

    const fresh = await generateRound({
      words: recentWords,
      categories: recentCategories,
    });

    const update: Record<string, unknown> = {
      category: fresh.category,
      secret_word: fresh.word,
      turn_index: 0,
      skip_votes: [],
      updated_at: new Date().toISOString(),
    };
    if ("guess_candidates" in room) {
      update.guess_candidates = fresh.candidates;
    }
    if (hasRecentWords) {
      update.recent_words = [...recentWords, fresh.word].slice(-20);
    }
    if (hasRecentCategories) {
      update.recent_categories = [...recentCategories, fresh.category].slice(
        -20
      );
    }

    const { error: updErr } = await supabaseAdmin
      .from("rooms")
      .update(update)
      .eq("code", code);
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    // Reset this round's clues so the round restarts from scratch.
    const { error: delErr } = await supabaseAdmin
      .from("clues")
      .delete()
      .eq("room_code", code)
      .eq("round", room.round);
    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }

    await notifyRoom(code, "word_skipped");
    return NextResponse.json({ ok: true, skipped: true });
  }

  // Not enough votes yet — persist the running tally.
  const { error: voteErr } = await supabaseAdmin
    .from("rooms")
    .update({ skip_votes: nextVotes, updated_at: new Date().toISOString() })
    .eq("code", code);
  if (voteErr) {
    return NextResponse.json({ error: voteErr.message }, { status: 500 });
  }

  await notifyRoom(code, "skip_vote");
  return NextResponse.json({ ok: true, skipped: false });
}
