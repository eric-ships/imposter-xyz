import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { notifyRoom } from "@/lib/room-state";
import { generateRound } from "@/lib/anthropic";
import { deadlineFor } from "@/lib/timer";
import {
  anteForOnChain,
  waitForTx,
  type SpendPermission,
} from "@/lib/escrow";

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
  if (room.host_id !== playerId) {
    return NextResponse.json({ error: "only host can start" }, { status: 403 });
  }
  if (room.state !== "lobby") {
    return NextResponse.json({ error: "already started" }, { status: 400 });
  }

  // select * so an un-migrated column (e.g. spend_permission) doesn't
  // nuke the query and make the host see the misleading
  // "need at least 3 players" error with a full room.
  const { data: players, error: playersErr } = await supabaseAdmin
    .from("players")
    .select("*")
    .eq("room_code", code)
    .order("joined_at", { ascending: true });

  if (playersErr) {
    console.error("[start] players query error", {
      code,
      error: playersErr.message,
    });
    return NextResponse.json(
      { error: `could not read players: ${playersErr.message}` },
      { status: 500 }
    );
  }

  if (!players || players.length < 3) {
    return NextResponse.json(
      { error: "need at least 3 players" },
      { status: 400 }
    );
  }

  // Pot game: every player must have a Spend Permission registered so the
  // resolver can auto-ante them. Pull each one via anteFor before we flip
  // state to 'playing' — if any pull fails we bail so the host can void.
  if (room.pot_enabled) {
    const chainGameId = room.chain_game_id as `0x${string}` | null;
    if (!chainGameId) {
      return NextResponse.json(
        { error: "pot enabled but no chain game id" },
        { status: 500 }
      );
    }
    const unpaid = players.filter(
      (p) => !p.ante_tx && !p.spend_permission
    );
    if (unpaid.length > 0) {
      return NextResponse.json(
        {
          error: `waiting on ${unpaid.length} player${unpaid.length === 1 ? "" : "s"} to authorize`,
        },
        { status: 400 }
      );
    }

    for (const p of players) {
      if (p.ante_tx) continue; // already anted this round
      const permission = p.spend_permission as SpendPermission | null;
      if (!permission) continue; // defensive, should be caught above
      try {
        const hash = await anteForOnChain(chainGameId, permission);
        await waitForTx(hash);
        await supabaseAdmin
          .from("players")
          .update({ ante_tx: hash })
          .eq("id", p.id);
      } catch (e) {
        return NextResponse.json(
          {
            error:
              e instanceof Error
                ? `ante failed for a player: ${e.message}`
                : "ante failed",
          },
          { status: 500 }
        );
      }
    }
  }

  const ids = players.map((p) => p.id);
  // Imposter scaling:
  //   3-4 players → 1 imposter
  //   5-7 players → 2 imposters
  //   8 players   → 3 imposters
  // Imposters don't know about each other — their client view just
  // shows "isImposter = true".
  // EXCEPT in mole mode, where there are always exactly 2 imposters
  // (they know each other) and crewmates pair up. If the crew count is
  // odd, one crewmate is left without a partner.
  const isMoleMode = "mole_mode" in room && !!room.mole_mode;
  const imposterCount = isMoleMode
    ? Math.min(2, ids.length - 1) // never more imposters than (N-1)
    : ids.length >= 8
      ? 3
      : ids.length >= 5
        ? 2
        : 1;
  const imposterIds = shuffle(ids).slice(0, imposterCount);
  const imposterId = imposterIds[0]; // legacy singleton field
  const turnOrder = shuffle(ids);

  // Tolerate older rooms that haven't been migrated yet: only track recent
  // words/categories if the columns exist on the row.
  const hasRecentWords = "recent_words" in room;
  const hasRecentCategories = "recent_categories" in room;
  const recentWords: string[] = hasRecentWords ? (room.recent_words ?? []) : [];
  const recentCategories: string[] = hasRecentCategories
    ? (room.recent_categories ?? [])
    : [];

  // Consume a pre-warmed round if the lobby prewarm finished while we
  // waited. Otherwise generate now.
  const hasPrewarm = "prewarm_word" in room;
  const hasPrewarmCandidates = "prewarm_candidates" in room;
  let category: string;
  let word: string;
  let candidates: string[] = [];
  if (hasPrewarm && room.prewarm_word && room.prewarm_category) {
    word = room.prewarm_word;
    category = room.prewarm_category;
    if (
      hasPrewarmCandidates &&
      Array.isArray(room.prewarm_candidates) &&
      room.prewarm_candidates.length > 0
    ) {
      candidates = room.prewarm_candidates as string[];
    }
  } else {
    const fresh = await generateRound({
      words: recentWords,
      categories: recentCategories,
    });
    category = fresh.category;
    word = fresh.word;
    candidates = fresh.candidates;
  }

  const update: Record<string, unknown> = {
    state: "playing",
    category,
    secret_word: word,
    imposter_id: imposterId,
    round: 1,
    turn_index: 0,
    turn_order: turnOrder,
    updated_at: new Date().toISOString(),
  };
  if ("imposter_ids" in room) {
    update.imposter_ids = imposterIds;
  }
  if ("caught_imposter_id" in room) {
    update.caught_imposter_id = null;
  }
  if ("guess_candidates" in room) {
    // Always store the candidate list now — the secret was picked from
    // it, so the shortlist is always consistent. The casual-mode toggle
    // controls whether the UI displays it during the match; the
    // caught-imposter guess phase always shows it.
    update.guess_candidates = candidates;
  }
  if (hasRecentWords) {
    update.recent_words = [...recentWords, word].slice(-20);
  }
  if (hasRecentCategories) {
    update.recent_categories = [...recentCategories, category].slice(-20);
  }
  if (hasPrewarm) {
    // Clear so the next round's prewarm isn't served again.
    update.prewarm_word = null;
    update.prewarm_category = null;
    update.prewarm_started_at = null;
    if (hasPrewarmCandidates) {
      update.prewarm_candidates = [];
    }
  }
  // Only write phase_deadline if the column is migrated. Without it, the
  // timer quietly no-ops but the game still works end-to-end.
  if ("phase_deadline" in room) {
    update.phase_deadline = deadlineFor("playing");
  }

  const { error } = await supabaseAdmin
    .from("rooms")
    .update(update)
    .eq("code", code);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Mole mode: pair the crewmates and write each player's partner_id.
  // Imposters always have partner_id = null (they "know" each other via
  // imposter_ids, not partner_id). Imposter count was picked above so
  // crewmate count is always even, but we guard anyway.
  if (isMoleMode) {
    const imposterSet = new Set(imposterIds);
    const crewIds = shuffle(ids.filter((id) => !imposterSet.has(id)));

    // First: clear partner_id for everyone in the room (defensive in
    // case a previous match left stale data).
    await supabaseAdmin
      .from("players")
      .update({ partner_id: null })
      .eq("room_code", code);

    // Pair adjacent crewmates in the shuffled list. If odd somehow, the
    // last one is left unpaired.
    for (let i = 0; i + 1 < crewIds.length; i += 2) {
      const a = crewIds[i];
      const b = crewIds[i + 1];
      await Promise.all([
        supabaseAdmin
          .from("players")
          .update({ partner_id: b })
          .eq("id", a),
        supabaseAdmin
          .from("players")
          .update({ partner_id: a })
          .eq("id", b),
      ]);
    }
  }

  await notifyRoom(code, "game_started");

  return NextResponse.json({ ok: true });
}
