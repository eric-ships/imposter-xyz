// Identity resolution for the Embedded App Activity.
//
// The Activity runs in a fresh Discord iframe with no prior Upper
// localStorage, so there is never a device identity to merge — we
// simply find-or-create an Upper user keyed on discord_id, then mint a
// device token bound to it. The Activity stores that token in
// localStorage so the room page's identity bootstrap (/api/users/me)
// recognises the player as their Discord-linked account.
import { randomUUID } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { discordDisplayName, type DiscordUser } from "@/lib/discord";

export async function resolveActivityIdentity(discord: DiscordUser): Promise<{
  userId: string;
  deviceToken: string;
  nickname: string;
}> {
  const displayName = discordDisplayName(discord);
  const discordFields = {
    discord_id: discord.id,
    discord_username: displayName,
    discord_avatar: discord.avatarUrl,
  };

  // Find an existing user for this Discord account, else mint one.
  const { data: existing } = await supabaseAdmin
    .from("users")
    .select("id, default_nickname")
    .eq("discord_id", discord.id)
    .maybeSingle();

  let userId: string;
  let nickname: string;
  if (existing) {
    userId = existing.id as string;
    nickname = (existing.default_nickname as string | null) ?? displayName;
    // Refresh the display snapshot (username / avatar can change).
    await supabaseAdmin.from("users").update(discordFields).eq("id", userId);
  } else {
    const { data: created, error } = await supabaseAdmin
      .from("users")
      .insert({ ...discordFields, default_nickname: displayName })
      .select("id")
      .single();
    if (error || !created) {
      throw new Error(error?.message ?? "could not create user");
    }
    userId = created.id as string;
    nickname = displayName;
  }

  // Mint a device token bound to this user.
  const deviceToken = randomUUID();
  const { error: bindErr } = await supabaseAdmin
    .from("user_device_tokens")
    .insert({ device_token: deviceToken, user_id: userId });
  if (bindErr) {
    throw new Error(bindErr.message);
  }

  return { userId, deviceToken, nickname };
}
