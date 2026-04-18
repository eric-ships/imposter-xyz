import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { generateWordPrompt } from "@/lib/anthropic";

// Kick off a Claude word generation in the lobby so /start is instant.
// Safe to call many times: if a prewarm is already cached or already
// in-flight (< 30s ago), we no-op.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code: raw } = await params;
  const code = raw.toUpperCase();

  const { data: room, error } = await supabaseAdmin
    .from("rooms")
    .select("*")
    .eq("code", code)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!room) {
    return NextResponse.json({ error: "room not found" }, { status: 404 });
  }
  if (room.state !== "lobby") {
    return NextResponse.json({ ok: true, skipped: "not-lobby" });
  }
  if (!("prewarm_word" in room)) {
    // Schema not migrated; nothing to do.
    return NextResponse.json({ ok: true, skipped: "no-prewarm-columns" });
  }
  if (room.prewarm_word) {
    return NextResponse.json({ ok: true, cached: true });
  }

  // Simple in-flight guard: if another prewarm started within 30s, skip.
  const startedAt = room.prewarm_started_at
    ? new Date(room.prewarm_started_at).getTime()
    : 0;
  if (startedAt && Date.now() - startedAt < 30_000) {
    return NextResponse.json({ ok: true, skipped: "in-flight" });
  }

  // Mark in-flight.
  await supabaseAdmin
    .from("rooms")
    .update({ prewarm_started_at: new Date().toISOString() })
    .eq("code", code);

  try {
    const { category, word } = await generateWordPrompt({
      words: room.recent_words ?? [],
      categories: room.recent_categories ?? [],
    });
    await supabaseAdmin
      .from("rooms")
      .update({
        prewarm_word: word,
        prewarm_category: category,
      })
      .eq("code", code);
    return NextResponse.json({ ok: true, cached: false });
  } catch (e) {
    // Release the in-flight lock so a retry can try again.
    await supabaseAdmin
      .from("rooms")
      .update({ prewarm_started_at: null })
      .eq("code", code);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "prewarm failed" },
      { status: 500 }
    );
  }
}
