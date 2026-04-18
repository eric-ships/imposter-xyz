import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { notifyRoom } from "@/lib/room-state";
import { generateWordPrompt } from "@/lib/anthropic";

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

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

  const { data: room } = await supabaseAdmin
    .from("rooms")
    .select("code, host_id, state, recent_words, recent_categories")
    .eq("code", code)
    .maybeSingle();

  if (!room) {
    return NextResponse.json({ error: "room not found" }, { status: 404 });
  }
  if (room.host_id !== playerId) {
    return NextResponse.json({ error: "only host can start" }, { status: 403 });
  }
  if (room.state !== "lobby") {
    return NextResponse.json({ error: "already started" }, { status: 400 });
  }

  const { data: players } = await supabaseAdmin
    .from("players")
    .select("id")
    .eq("room_code", code)
    .order("joined_at", { ascending: true });

  if (!players || players.length < 3) {
    return NextResponse.json(
      { error: "need at least 3 players" },
      { status: 400 }
    );
  }

  const ids = players.map((p) => p.id);
  const imposterId = ids[Math.floor(Math.random() * ids.length)];
  const turnOrder = shuffle(ids);

  const recentWords: string[] = room.recent_words ?? [];
  const recentCategories: string[] = room.recent_categories ?? [];
  const { category, word } = await generateWordPrompt({
    words: recentWords,
    categories: recentCategories,
  });

  const nextRecentWords = [...recentWords, word].slice(-20);
  const nextRecentCategories = [...recentCategories, category].slice(-20);

  const { error } = await supabaseAdmin
    .from("rooms")
    .update({
      state: "playing",
      category,
      secret_word: word,
      imposter_id: imposterId,
      round: 1,
      turn_index: 0,
      turn_order: turnOrder,
      recent_words: nextRecentWords,
      recent_categories: nextRecentCategories,
      updated_at: new Date().toISOString(),
    })
    .eq("code", code);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await notifyRoom(code, "game_started");

  return NextResponse.json({ ok: true });
}
