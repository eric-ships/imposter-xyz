import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { generateCandidates } from "@/lib/anthropic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code: raw } = await params;
  const code = raw.toUpperCase();
  const playerId = new URL(request.url).searchParams.get("playerId");
  if (!playerId) {
    return NextResponse.json({ error: "playerId required" }, { status: 400 });
  }

  const { data: room } = await supabaseAdmin
    .from("rooms")
    .select("*")
    .eq("code", code)
    .maybeSingle();

  if (!room) {
    return NextResponse.json({ error: "room not found" }, { status: 404 });
  }
  if (room.state !== "guessing") {
    return NextResponse.json(
      { error: "not in guessing phase" },
      { status: 400 }
    );
  }

  const caughtImposterId: string | null =
    (room.caught_imposter_id as string | null) ??
    (room.imposter_id as string | null);
  if (caughtImposterId !== playerId) {
    return NextResponse.json(
      { error: "only the caught imposter can fetch candidates" },
      { status: 403 }
    );
  }

  // Use the cached list if this round already produced one. This keeps the
  // imposter staring at the same set across refreshes, and avoids a second
  // Claude call (and the chance of a different list with different items).
  const cached: string[] = Array.isArray(room.guess_candidates)
    ? room.guess_candidates
    : [];
  if (cached.length > 0) {
    return NextResponse.json({ candidates: cached });
  }

  if (!room.category || !room.secret_word) {
    return NextResponse.json(
      { error: "round not initialized" },
      { status: 400 }
    );
  }

  const candidates = await generateCandidates(
    room.category,
    room.secret_word
  );

  // Best-effort cache. If the column doesn't exist yet (pre-migration) the
  // update will fail; we still return the freshly-generated list so the
  // feature works end-to-end before the migration lands.
  if ("guess_candidates" in room) {
    await supabaseAdmin
      .from("rooms")
      .update({ guess_candidates: candidates })
      .eq("code", code);
  }

  return NextResponse.json({ candidates });
}
