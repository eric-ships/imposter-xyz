# imposter.xyz

A real-time social deduction word game. Everyone sees a shared category. Everyone except one player (the imposter) also sees the secret word. Take turns giving one-word clues for 3 rounds, then vote on who the imposter is.

Built with Next.js 16, Supabase (Postgres + Realtime), and Claude Haiku for dynamic category/word generation.

## Setup

### 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a new project (free tier is fine).
2. Once it's ready, open the SQL editor and paste the contents of `supabase/schema.sql`. Run it.
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

Open [http://localhost:3000](http://localhost:3000). Create a room, share the link, and play with 3+ people.

## Deploy to Vercel

1. Push to GitHub.
2. Import the repo on [vercel.com](https://vercel.com).
3. Add the four env vars from `.env.example` in the Vercel project settings.
4. Deploy.

## How the game works

- **Lobby**: host creates a room, shares the 4-letter code. Players join with a nickname. Minimum 3 players.
- **Start**: host clicks start. The server generates a category + secret word via Claude Haiku, picks a random imposter, and randomizes turn order.
- **Play**: 3 rounds. On each turn, the current player submits a one-word clue. The imposter only sees the category (not the word) and must bluff.
- **Vote**: after 3 rounds, everyone votes on who they think the imposter is.
- **Reveal**: imposter revealed. If caught (plurality), all non-imposters get +1 point. Otherwise, the imposter gets +2.
- **Play again**: host can restart the round with the same players (scores persist).

## Architecture

- `src/app/api/rooms/...` — REST endpoints for all mutations. The server is authoritative; it holds the secret word and imposter id.
- `src/app/page.tsx` — home (create/join).
- `src/app/room/[code]/page.tsx` — room page with all phases (lobby / playing / voting / reveal).
- `src/lib/anthropic.ts` — `generateWordPrompt()` calls Claude Haiku 4.5 for a fresh `{category, word}` each game.
- `src/lib/supabase/server.ts` — service-role client, server only.
- `src/lib/supabase/browser.ts` — anon client for Realtime subscriptions.
- Clients subscribe to INSERTs on the `room_events` table (realtime over Postgres changes) and refetch the full filtered state via `GET /api/rooms/:code?playerId=X` on every event. The server hides the secret word from the imposter's view and hides the imposter id until the reveal phase.
