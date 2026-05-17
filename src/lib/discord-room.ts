// Room creation for the Discord bot's /upper command. Distinct from
// POST /api/rooms: a bot room starts with zero players and a host_id
// that points at nobody. The first human to join inherits the host
// seat (see /api/rooms/[code]/join).
import { randomUUID } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { generateRoomCode } from "@/lib/room-code";

// Game kinds /upper can open a room for. Mirrors VALID_KINDS in
// /api/rooms — keep the two in lockstep.
export const BOT_ROOM_KINDS = [
  "imposter",
  "wavelength",
  "just-one",
  "crew",
  "hold",
] as const;
export type BotRoomKind = (typeof BOT_ROOM_KINDS)[number];

export const GAME_LABELS: Record<BotRoomKind, string> = {
  imposter: "Imposter",
  wavelength: "Wavelength",
  "just-one": "Just One",
  crew: "Crew",
  hold: "Hold",
};

// Creates an empty lobby room. Returns the room code, or null if a
// free code couldn't be allocated or the insert failed.
export async function createBotRoom(
  kind: BotRoomKind
): Promise<string | null> {
  let code = "";
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = generateRoomCode(4);
    const { data: existing } = await supabaseAdmin
      .from("rooms")
      .select("code")
      .eq("code", candidate)
      .maybeSingle();
    if (!existing) {
      code = candidate;
      break;
    }
  }
  if (!code) return null;

  // host_id is required but points at no player yet — the first
  // joiner claims it. Only set `kind` when non-default so a
  // pre-migration DB still accepts imposter rooms.
  const insertRow: Record<string, unknown> = {
    code,
    host_id: randomUUID(),
    show_candidates_always: true,
  };
  if (kind !== "imposter") insertRow.kind = kind;

  const { error } = await supabaseAdmin.from("rooms").insert(insertRow);
  if (error) return null;

  await supabaseAdmin
    .from("room_events")
    .insert({ room_code: code, kind: "room_created" });
  return code;
}
