# Discord setup

Upper has four Discord integrations. One Discord application powers all
of them. None of the code does anything until the steps below are done.

| Feature | What it needs | Code shipped in |
| --- | --- | --- |
| Sign in with Discord | OAuth2 redirect URI | PR 1 |
| Match-result webhooks | A channel webhook (no app) | PR 2 |
| `/upper` slash command | Bot + interactions endpoint | PR 3 |
| Embedded App Activity | Activity + URL mappings | PR 4 |

---

## 1. Create the Discord application

1. Go to <https://discord.com/developers/applications> → **New Application**.
2. On **General Information**, copy the **Application ID** — this is also
   your OAuth2 **Client ID**.
3. On **OAuth2**, copy the **Client Secret** (reset it if you need to).

## 2. OAuth2 — "Sign in with Discord" (PR 1)

On **OAuth2 → Redirects**, add one redirect per environment:

- `https://upper.games/api/auth/discord/callback`
- (optional, for previews) your Vercel preview URL + the same path

## 3. Bot — the `/upper` slash command (PR 3)

1. On **Bot**, click **Reset Token** and copy the **bot token**.
2. On **General Information**, copy the **Public Key**.
3. Set the **Interactions Endpoint URL** to
   `https://upper.games/api/discord/interactions` and save. Discord sends
   a signed PING — it only saves if the endpoint verifies it, so deploy
   PR 3 first.
4. Register the slash command once: with the env vars set locally, run
   `npm run discord:register`. Set `DISCORD_GUILD_ID` to a test server
   for an instant command; leave it unset to register globally (~1h to
   propagate).

## 4. Embedded App Activity (PR 4)

1. On **Activities → Settings**, enable the Activity.
2. Set the Activity entry URL to `https://upper.games/discord`.
3. Under **URL Mappings**, add:
   - prefix `/` → target `upper.games`
   - prefix `/supabase` → target `<your-project-ref>.supabase.co`
     (the host from `NEXT_PUBLIC_SUPABASE_URL`)

   The `/supabase` mapping lets the realtime websocket reach Supabase
   through Discord's proxy.

## 5. Match-result webhooks (PR 2)

No Discord application involved. In any Discord channel: **Edit Channel
→ Integrations → Webhooks → New Webhook → Copy Webhook URL**, then paste
it into a friend group's owner controls in Upper.

---

## Environment variables

Set these in the Vercel project (Production, and Preview if you added a
preview redirect). The `DISCORD_*` server vars must **not** be public.

| Variable | Value | Used by |
| --- | --- | --- |
| `DISCORD_CLIENT_ID` | Application ID | PR 1, PR 4 |
| `DISCORD_CLIENT_SECRET` | OAuth2 client secret | PR 1, PR 4 |
| `NEXT_PUBLIC_DISCORD_CLIENT_ID` | Application ID (again) | PR 4 (client) |
| `DISCORD_PUBLIC_KEY` | Public Key | PR 3 |
| `DISCORD_BOT_TOKEN` | Bot token | PR 3 |
| `DISCORD_APPLICATION_ID` | Application ID (again) | PR 3 register script |
| `DISCORD_GUILD_ID` | Test server id (optional) | PR 3 register script |
| `NEXT_PUBLIC_SITE_URL` | `https://upper.games` | PR 1, PR 3 |

`DISCORD_CLIENT_ID`, `NEXT_PUBLIC_DISCORD_CLIENT_ID`, and
`DISCORD_APPLICATION_ID` are all the same Application ID value — they are
separate names because some run server-side, one is exposed to the
browser, and one is read by the registration script.

## Database

Run `supabase/schema.sql` against the database before deploying — it is
idempotent. The Discord work adds `users.discord_id` /
`discord_username` / `discord_avatar`, `groups.discord_webhook_url`, and
`rooms.discord_instance_id`.
