// Discord OAuth2 helpers. Used by the sign-in flow
// (/api/auth/discord/start + /callback) to let a Discord account act
// as a portable Upper identity, the same way email magic links do.
//
// Only the `identify` scope is requested — we need the user's id,
// username, and avatar, nothing more.

const DISCORD_API = "https://discord.com/api";
const OAUTH_SCOPE = "identify";

export type DiscordUser = {
  id: string;
  username: string;
  // `global_name` is Discord's newer display name; legacy accounts
  // only have `username`. We prefer global_name when present.
  globalName: string | null;
  avatarUrl: string | null;
};

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} env var`);
  return v;
}

export function discordClientId(): string {
  return requireEnv("DISCORD_CLIENT_ID");
}

// The redirect URI must byte-for-byte match one registered in the
// Discord Developer Portal. Derived from the site origin so preview
// deployments and production each use their own.
export function discordRedirectUri(origin: string): string {
  return `${origin.replace(/\/$/, "")}/api/auth/discord/callback`;
}

export function discordAuthorizeUrl(args: {
  origin: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: discordClientId(),
    redirect_uri: discordRedirectUri(args.origin),
    response_type: "code",
    scope: OAUTH_SCOPE,
    state: args.state,
  });
  return `${DISCORD_API}/oauth2/authorize?${params.toString()}`;
}

// Exchange an authorization code for an access token.
export async function exchangeCode(args: {
  code: string;
  origin: string;
}): Promise<
  { ok: true; accessToken: string } | { ok: false; error: string }
> {
  const body = new URLSearchParams({
    client_id: discordClientId(),
    client_secret: requireEnv("DISCORD_CLIENT_SECRET"),
    grant_type: "authorization_code",
    code: args.code,
    redirect_uri: discordRedirectUri(args.origin),
  });
  const res = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    return { ok: false, error: `token exchange failed (${res.status})` };
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) {
    return { ok: false, error: "token exchange returned no access_token" };
  }
  return { ok: true, accessToken: data.access_token };
}

// Fetch the authenticated user's profile with an access token.
export async function fetchDiscordUser(
  accessToken: string
): Promise<{ ok: true; user: DiscordUser } | { ok: false; error: string }> {
  const res = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    return { ok: false, error: `user fetch failed (${res.status})` };
  }
  const d = (await res.json()) as {
    id?: string;
    username?: string;
    global_name?: string | null;
    avatar?: string | null;
  };
  if (!d.id || !d.username) {
    return { ok: false, error: "user fetch returned an unexpected shape" };
  }
  return {
    ok: true,
    user: {
      id: d.id,
      username: d.username,
      globalName: d.global_name ?? null,
      avatarUrl: d.avatar
        ? `https://cdn.discordapp.com/avatars/${d.id}/${d.avatar}.png`
        : null,
    },
  };
}

// The display name we'd seed onto a fresh Upper profile.
export function discordDisplayName(user: DiscordUser): string {
  return user.globalName?.trim() || user.username;
}
