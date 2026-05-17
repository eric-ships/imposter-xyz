// Merges one Upper user into another — used when a sign-in (email or
// Discord) discovers that the device-bound identity and the
// authenticated identity are two different `users` rows. Everything
// the "from" user owns is reassigned to the "to" user, then the
// "from" row is deleted (cascades clean up anything left).
//
// The move-order mirrors /api/auth/email/verify: FK and unique
// constraints dictate the sequence, and conflicts (both users already
// hold a row for the same group or match) resolve in favour of "to".
import type { SupabaseClient } from "@supabase/supabase-js";

export async function mergeUsers(
  db: SupabaseClient,
  fromUserId: string,
  toUserId: string
): Promise<void> {
  if (fromUserId === toUserId) return;

  // 1. players: plain FK update.
  await db
    .from("players")
    .update({ user_id: toUserId })
    .eq("user_id", fromUserId);

  // 2. group_members: UNIQUE(group_id, user_id). On conflict drop the
  //    from-row (keeps the to-user's per-group nickname); else move it.
  const { data: fromMemberships } = await db
    .from("group_members")
    .select("group_id")
    .eq("user_id", fromUserId);
  const { data: toMemberships } = await db
    .from("group_members")
    .select("group_id")
    .eq("user_id", toUserId);
  const toGroupIds = new Set(
    (toMemberships ?? []).map((m) => m.group_id as string)
  );
  for (const m of fromMemberships ?? []) {
    const gid = m.group_id as string;
    if (toGroupIds.has(gid)) {
      await db
        .from("group_members")
        .delete()
        .eq("group_id", gid)
        .eq("user_id", fromUserId);
    } else {
      await db
        .from("group_members")
        .update({ user_id: toUserId })
        .eq("group_id", gid)
        .eq("user_id", fromUserId);
    }
  }
  // Groups the from-user owned move their owner too.
  await db
    .from("groups")
    .update({ owner_user_id: toUserId })
    .eq("owner_user_id", fromUserId);

  // 3. match_player_results: PK(match_id, user_id). Same conflict rule.
  const { data: fromMatches } = await db
    .from("match_player_results")
    .select("match_id")
    .eq("user_id", fromUserId);
  const { data: toMatches } = await db
    .from("match_player_results")
    .select("match_id")
    .eq("user_id", toUserId);
  const toMatchIds = new Set(
    (toMatches ?? []).map((r) => r.match_id as string)
  );
  for (const r of fromMatches ?? []) {
    const mid = r.match_id as string;
    if (toMatchIds.has(mid)) {
      await db
        .from("match_player_results")
        .delete()
        .eq("match_id", mid)
        .eq("user_id", fromUserId);
    } else {
      await db
        .from("match_player_results")
        .update({ user_id: toUserId })
        .eq("match_id", mid)
        .eq("user_id", fromUserId);
    }
  }

  // 4. user_device_tokens: reassign every device of the from-user.
  await db
    .from("user_device_tokens")
    .update({ user_id: toUserId })
    .eq("user_id", fromUserId);

  // 5. Delete the now-empty from-user (cascade clears any leftovers).
  await db.from("users").delete().eq("id", fromUserId);
}
