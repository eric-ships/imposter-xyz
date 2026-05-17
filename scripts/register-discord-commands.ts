// Registers (or refreshes) Upper's Discord slash commands.
//
//   npm run discord:register
//
// Reads DISCORD_BOT_TOKEN and DISCORD_APPLICATION_ID from the
// environment. If DISCORD_GUILD_ID is set, commands register to that
// one guild and appear instantly — ideal while testing. Without it
// they register globally (up to ~1h to propagate to every server).
//
// Self-contained on purpose: the game list is duplicated from
// src/lib/discord-room.ts so this dev script needs no app imports.
import "dotenv/config";

// Keep in lockstep with BOT_ROOM_KINDS / GAME_LABELS in
// src/lib/discord-room.ts.
const GAME_CHOICES = [
  { name: "Imposter", value: "imposter" },
  { name: "Wavelength", value: "wavelength" },
  { name: "Just One", value: "just-one" },
  { name: "Crew", value: "crew" },
  { name: "Hold", value: "hold" },
];

const commands = [
  {
    name: "upper",
    description: "Open an Upper game room and share the join link",
    options: [
      {
        type: 3, // STRING
        name: "game",
        description: "Which game to play (defaults to Imposter)",
        required: false,
        choices: GAME_CHOICES,
      },
    ],
  },
];

async function main() {
  const token = process.env.DISCORD_BOT_TOKEN;
  const appId = process.env.DISCORD_APPLICATION_ID;
  const guildId = process.env.DISCORD_GUILD_ID?.trim();
  if (!token || !appId) {
    console.error(
      "Set DISCORD_BOT_TOKEN and DISCORD_APPLICATION_ID before running."
    );
    process.exit(1);
  }

  const url = guildId
    ? `https://discord.com/api/v10/applications/${appId}/guilds/${guildId}/commands`
    : `https://discord.com/api/v10/applications/${appId}/commands`;

  const res = await fetch(url, {
    method: "PUT", // PUT bulk-overwrites — idempotent re-registration.
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
  });

  if (!res.ok) {
    console.error(`Registration failed (${res.status}):`, await res.text());
    process.exit(1);
  }
  console.log(
    `Registered ${commands.length} command(s) ${
      guildId ? `to guild ${guildId}` : "globally"
    }.`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
