import { NextResponse } from "next/server";
import { exchangeActivityCode, fetchDiscordUser } from "@/lib/discord";
import { resolveActivityIdentity } from "@/lib/discord-identity";

// POST /api/discord/activity
// Body: { code } — the OAuth code from the Embedded App SDK's
// `authorize` command.
//
// Exchanges the code, resolves the Discord account to an Upper user,
// and returns:
//   - accessToken: passed back to sdk.commands.authenticate
//   - deviceToken: the Activity stores this in localStorage so the
//     room page's identity bootstrap recognises the player
//   - userId / nickname: for display
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { code?: string };
  const code = body.code?.trim();
  if (!code) {
    return NextResponse.json({ error: "code required" }, { status: 400 });
  }

  const token = await exchangeActivityCode(code);
  if (!token.ok) {
    return NextResponse.json({ error: token.error }, { status: 502 });
  }

  const user = await fetchDiscordUser(token.accessToken);
  if (!user.ok) {
    return NextResponse.json({ error: user.error }, { status: 502 });
  }

  try {
    const identity = await resolveActivityIdentity(user.user);
    return NextResponse.json({
      accessToken: token.accessToken,
      userId: identity.userId,
      deviceToken: identity.deviceToken,
      nickname: identity.nickname,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "identity resolution failed" },
      { status: 500 }
    );
  }
}
