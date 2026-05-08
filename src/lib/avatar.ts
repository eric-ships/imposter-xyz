// Shared avatar primitives. Used by both imposter and wavelength room
// UIs so player colors are identical across games. Pulling this into
// its own module also gives non-page modules (like /src/games/*) a
// way to render avatars without depending on the imposter page.

export const AVATAR_PALETTE = [
  "bg-[#b04a4a]", // red
  "bg-[#3d8073]", // teal
  "bg-[#c89344]", // gold
  "bg-[#7a5ca8]", // purple
  "bg-[#4f7a3e]", // forest green
  "bg-[#4a86a8]", // sky blue
  "bg-[#b25c8c]", // magenta / rose
  "bg-[#c97240]", // burnt orange
  "bg-[#8b9333]", // olive
  "bg-[#4d6db0]", // indigo
  "bg-[#87593b]", // brown
  "bg-[#5a6470]", // slate
];

// Hash an id to a stable palette slot. Used as a fallback when we
// don't have the room's player list (top-level chrome paths) and as
// the seed offset for unique assignment when we do.
export function hashIndex(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % AVATAR_PALETTE.length;
}

export function avatarFor(
  id: string,
  nickname: string,
  custom?: string | null,
  // Optional roster: if passed, the player's color comes from their
  // joined-order index, guaranteeing every player in the room gets a
  // distinct color (capped at 8 players, 12 palette slots — always
  // collision-free in practice). Without the roster we fall back to a
  // per-id hash, which can collide but stays stable across rooms.
  players?: { id: string }[]
) {
  let colorIndex: number;
  if (players && players.length > 0) {
    const idx = players.findIndex((p) => p.id === id);
    colorIndex = idx >= 0 ? idx % AVATAR_PALETTE.length : hashIndex(id);
  } else {
    colorIndex = hashIndex(id);
  }
  const color = AVATAR_PALETTE[colorIndex];
  const fallback = nickname.trim().charAt(0).toUpperCase() || "?";
  const initial = custom?.trim() || fallback;
  // Custom emoji avatars hide the bg color (the emoji renders as its
  // own glyph). Fall back to colored initial when no custom is set.
  const isCustom = !!custom?.trim();
  return { color: isCustom ? "bg-surface" : color, initial, isCustom };
}
