import { verifyKey } from "discord-interactions";
import {
  BOT_ROOM_KINDS,
  GAME_LABELS,
  createBotRoom,
  type BotRoomKind,
} from "@/lib/discord-room";

// Discord HTTP interactions endpoint. Discord POSTs every slash-command
// invocation here; we verify its Ed25519 signature, then handle the
// /upper command by opening a fresh room and replying with a join link.
//
// Serverless-friendly: no gateway connection, no long-running process —
// Discord calls us and we answer within its 3-second budget.

const EMBED_COLOR = 0xb04a4a;

// Interaction + response type tags from the Discord API spec.
const TYPE_PING = 1;
const TYPE_APPLICATION_COMMAND = 2;
const RES_PONG = 1;
const RES_MESSAGE = 4;

function siteOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "") ||
    "https://upper.games"
  );
}

function plainMessage(content: string) {
  return Response.json({ type: RES_MESSAGE, data: { content } });
}

export async function POST(request: Request) {
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  const signature = request.headers.get("x-signature-ed25519");
  const timestamp = request.headers.get("x-signature-timestamp");
  // The raw body is required verbatim for signature verification —
  // read it as text, never request.json().
  const rawBody = await request.text();

  if (!publicKey || !signature || !timestamp) {
    return new Response("bad request", { status: 401 });
  }
  const valid = await verifyKey(rawBody, signature, timestamp, publicKey);
  if (!valid) {
    return new Response("invalid request signature", { status: 401 });
  }

  const interaction = JSON.parse(rawBody) as {
    type: number;
    data?: {
      name?: string;
      options?: Array<{ name: string; value: string }>;
    };
  };

  // Discord's periodic endpoint health check.
  if (interaction.type === TYPE_PING) {
    return Response.json({ type: RES_PONG });
  }

  if (
    interaction.type === TYPE_APPLICATION_COMMAND &&
    interaction.data?.name === "upper"
  ) {
    const requested = interaction.data.options?.find(
      (o) => o.name === "game"
    )?.value;
    const kind: BotRoomKind = BOT_ROOM_KINDS.includes(
      requested as BotRoomKind
    )
      ? (requested as BotRoomKind)
      : "imposter";

    const code = await createBotRoom(kind);
    if (!code) {
      return plainMessage(
        "Couldn't open a room just now — try again in a moment."
      );
    }
    const url = `${siteOrigin()}/room/${code}`;
    return Response.json({
      type: RES_MESSAGE,
      data: {
        embeds: [
          {
            title: `${GAME_LABELS[kind]} room is open`,
            url,
            description: `Room code **${code}**\nTap below to join — first one in hosts.`,
            color: EMBED_COLOR,
            footer: { text: "Upper · upper.games" },
          },
        ],
        components: [
          {
            type: 1, // action row
            components: [
              {
                type: 2, // button
                style: 5, // link-style button
                label: "Join the room",
                url,
              },
            ],
          },
        ],
      },
    });
  }

  return plainMessage("Unknown command.");
}
