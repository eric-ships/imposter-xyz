# Upper

Short, social games for the group. Three to eight players, five to twenty minutes per match, playable in a shared room from your phone.

Three games in one platform:

- **Imposter** — social deduction. Everyone sees the category; one player (the imposter) doesn't see the secret word. Bluff or get caught.
- **Wavelength** — spectrum guessing. The psychic gets a hidden target on a dial; their team has to read the clue and dial in.
- **Just One** — cooperative clue-giving. Duplicate clues are silently eliminated before the guesser sees them.

Friend groups: claim an identity that follows you across rooms, attribute matches to a group, and stats accrue per game per person.

Built with Next.js 16, Supabase (Postgres + Realtime), and Claude Haiku for dynamic word/category/concept generation.

## Setup

### 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a new project (free tier is fine).
2. Open the SQL editor and run the contents of `supabase/schema.sql`. It's idempotent — every statement is `if not exists`.
3. In **Project Settings → API**, grab these three values:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` secret key → `SUPABASE_SERVICE_ROLE_KEY`

### 2. Get an Anthropic API key

1. Go to [console.anthropic.com](https://console.anthropic.com) and create an API key.
2. Save it as `ANTHROPIC_API_KEY`.

### 3. Set up env vars

```bash
cp .env.example .env.local
# fill in the values
```

### 4. Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Create a room, pick a game, share the 4-letter code, and play with 3+ people.

## Deploy to Vercel

1. Push to GitHub.
2. Import the repo on [vercel.com](https://vercel.com).
3. Add the four env vars from `.env.example` in the Vercel project settings.
4. Deploy.

## Architecture

- `src/app/page.tsx` — home (create / join, my groups, personal stats).
- `src/app/room/[code]/page.tsx` — room shell. Dispatches to per-game body based on `view.kind`.
- `src/app/group/[id]/page.tsx` — friend group page (roster / stats / recent).
- `src/app/api/rooms/...` — REST endpoints for room mutations. Server is authoritative; secrets / target / imposter id never leave the server-side filter.
- `src/games/{imposter,wavelength,just-one}/` — per-game state machines + UI bodies. Each owns its own `game_state` jsonb shape on the polymorphic rooms table.
- `src/lib/identity.ts` + `src/app/api/users/me/...` — device-bound user identity bootstrap.
- `src/lib/group-stats-aggregate.ts` — pure aggregation for `match_results` / `match_player_results`.
- `src/lib/anthropic.ts` — Claude Haiku 4.5 prompt for category + secret word generation (Imposter).
- `src/lib/supabase/server.ts` — service-role client, server only.
- `src/lib/supabase/browser.ts` — anon client for Realtime subscriptions.

Clients subscribe to INSERTs on the `room_events` table (realtime over Postgres changes) and refetch the full server-filtered view on every event. The view layer redacts per-game secrets (Imposter's word, Wavelength's target, Just One's surviving-clue authorship) before the payload leaves the server.
