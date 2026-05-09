// Shared constants + helpers for the groups endpoints. Lives outside
// any route file so multiple routes can import without cluttering the
// route's HTTP-handler exports.

// Soft cap: warn into logs when a group grows past this so we can
// spot organic groups bumping into the hard cap. No user-visible
// surface — internal-only signal until proper analytics ship.
export const SIZE_WARN_THRESHOLD = 10;

// Hard cap. Past this the join endpoint returns 400. Bigger feels
// like it should be a server / community, not a friend group.
export const SIZE_HARD_CAP = 12;

// Wraps the size-warn into a JSON line so a future analytics layer
// can swap console.warn for a structured event emit without touching
// call sites.
export function warnGroupSize(groupId: string, count: number) {
  if (count <= SIZE_WARN_THRESHOLD) return;
  console.warn(
    JSON.stringify({
      event: "group_size_threshold",
      groupId,
      count,
      threshold: SIZE_WARN_THRESHOLD,
      ts: Date.now(),
    })
  );
}
