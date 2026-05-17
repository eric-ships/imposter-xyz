-- Crypto Imposter schema
-- Run this in your Supabase SQL editor after creating a project.

create extension if not exists "pgcrypto";

create table if not exists rooms (
  code text primary key,
  host_id uuid not null,
  state text not null default 'lobby', -- lobby | playing | voting | guessing | reveal
  category text,
  secret_word text,
  imposter_id uuid,
  round int not null default 0,
  total_rounds int not null default 3,
  turn_index int not null default 0,
  turn_order uuid[] not null default '{}',
  imposter_guess text,
  guess_outcome text, -- 'exact' | 'close' | 'wrong' | null
  recent_words text[] not null default '{}',
  recent_categories text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- For projects that already ran an older schema.sql:
alter table rooms add column if not exists imposter_guess text;
alter table rooms add column if not exists guess_outcome text;
alter table rooms
  add column if not exists recent_words text[] not null default '{}';
alter table rooms
  add column if not exists recent_categories text[] not null default '{}';
alter table rooms add column if not exists prewarm_word text;
alter table rooms add column if not exists prewarm_category text;
alter table rooms
  add column if not exists prewarm_candidates text[] not null default '{}';
alter table rooms
  add column if not exists prewarm_started_at timestamptz;

-- Per-phase deadline. Set whenever state advances into playing / voting /
-- guessing; cleared on reveal/lobby. Drives the client countdown and the
-- /expire route's forfeit logic.
alter table rooms add column if not exists phase_deadline timestamptz;

-- Cached list of plausible category members (including the secret), shown
-- to the caught imposter as a pickable cheat-sheet during guessing. Lazily
-- generated on first request and cleared at round/match boundaries.
alter table rooms
  add column if not exists guess_candidates text[] not null default '{}';

-- Shortlist mode: when true, the candidate shortlist is generated at
-- game start and visible to everyone the whole match (not just during
-- the caught-imposter guess phase). On by default; hosts can toggle.
alter table rooms
  add column if not exists show_candidates_always boolean not null default true;
alter table rooms
  alter column show_candidates_always set default true;

-- "Moley moley mole" mode: when true, imposters know each other and
-- crewmates are paired up at game start (each crewmate knows their
-- partner). Imposter count picks so crewmates always pair evenly
-- (1 imposter if player count is odd, 2 if even).
alter table rooms
  add column if not exists mole_mode boolean not null default false;

-- "Jesus christ" mode: when true, exactly 1 imposter is seated and
-- they know one randomly-chosen crewmate ("their jesus"). The
-- crewmate does NOT know they've been outed — pure asymmetric info
-- for the imposter's bluffing. Stored via partner_id on the imposter
-- row pointing at the jesus crewmate.
alter table rooms
  add column if not exists jesus_mode boolean not null default false;

-- "Police" mode: when true, one random crewmate is secretly assigned
-- the cop role at game start. They get one investigation per match —
-- pick any other player to learn whether that player is an imposter.
-- Their identity is private; the result is shown only to them.
alter table rooms
  add column if not exists police_mode boolean not null default false;
alter table rooms add column if not exists police_id uuid;
alter table players add column if not exists investigated_id uuid;

-- Streamer mode: host opt-in flag. Surfaces a "cast this URL" pill in
-- every player's room view pointing at /spectate/CODE, and is the
-- signal hosts use to coordinate "phones for play, TV for the table."
-- Pure UX flag — does not change game logic, redaction, or scoring.
-- Toggleable in any phase (host might decide to start streaming
-- mid-match), unlike mole/jesus/police which bake into match start.
alter table rooms
  add column if not exists streamer_mode boolean not null default false;

-- Lobby-scoped match history. Each completed match (when a host hits
-- "Play again") appends a JSON snapshot of the round's outcome:
--   { matchNumber, category, secretWord, imposterIds, caughtImposterId,
--     guess, guessOutcome, winner, endedAt, perPlayer: [{playerId,
--     wasImposter, delta}] }
-- Lives only as long as the room (cascade-deleted on room delete).
-- Powers the lobby Stats panel (per-player W/L by role).
alter table rooms
  add column if not exists match_history jsonb not null default '[]'::jsonb;

-- Multi-game support. 'imposter' is the only kind today; 'wavelength'
-- and others will be added as game modules ship. game_state holds
-- per-game scratch state — anything game-specific that doesn't warrant
-- a dedicated column (e.g. wavelength's target band, current psychic
-- index, dial guesses). Imposter's own state still lives in dedicated
-- columns above for now and may migrate into game_state opportunistically.
alter table rooms
  add column if not exists kind text not null default 'imposter';
alter table rooms
  add column if not exists game_state jsonb not null default '{}'::jsonb;

-- Multi-imposter support. For 5-player rooms we seat 2 imposters; 3-4
-- stays at 1. imposter_id (singular, older column) stays populated with
-- the *first* imposter so legacy reads still work. caught_imposter_id
-- is the specific imposter the crew caught in the vote — that person
-- takes the guess.
alter table rooms add column if not exists imposter_ids uuid[] not null default '{}';
alter table rooms add column if not exists caught_imposter_id uuid;

-- Skip-the-word votes. During the imposter clue phase, crewmates can
-- vote to discard a bad secret word and draw a new one. Holds the
-- player ids of crewmates currently voting to skip; cleared when a
-- skip lands and at every round boundary.
alter table rooms add column if not exists skip_votes uuid[] not null default '{}';

-- Pot / escrow fields.
alter table rooms add column if not exists pot_enabled boolean not null default false;
-- Ante stored as the exact integer string in token base units (USDC: 6 decimals),
-- e.g. "1000000" for 1 USDC. Avoids any numeric <-> bigint conversion drift.
alter table rooms add column if not exists ante_amount text;
alter table rooms add column if not exists chain_game_id text;
alter table rooms add column if not exists chain_create_tx text;
alter table rooms add column if not exists chain_resolve_tx text;

alter table players add column if not exists wallet_address text;
alter table players add column if not exists ante_tx text;
-- Base Account Spend Permission granted by the player (serialized JSON of
-- the EIP-712 struct + signature + on-chain approve tx).
alter table players add column if not exists spend_permission jsonb;
alter table players add column if not exists spend_permission_tx text;

create table if not exists payouts (
  id bigserial primary key,
  room_code text not null references rooms(code) on delete cascade,
  player_id uuid references players(id) on delete set null,
  wallet text not null,
  amount text not null,
  tx_hash text not null,
  kind text not null, -- 'payout' | 'refund'
  created_at timestamptz not null default now()
);

create index if not exists payouts_room_idx on payouts(room_code, created_at);

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  room_code text not null references rooms(code) on delete cascade,
  nickname text not null,
  score int not null default 0,
  joined_at timestamptz not null default now()
);

create index if not exists players_room_idx on players(room_code);

-- Identity layer (Phase 1 of friend-groups). Each visitor gets a
-- device-bound UUID stored in their localStorage (`imposter:userId`)
-- on first visit. The server upserts a users row keyed on that token.
-- Cross-device portability is intentionally NOT a v1 feature — losing
-- localStorage = new identity. Email/wallet auth can layer on later.
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  device_token text unique not null,
  default_nickname text,
  default_avatar text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- Wire existing players to users. Nullable for legacy rows + the
-- transitional period; lazily backfilled on next room interaction.
alter table players
  add column if not exists user_id uuid references users(id);
create index if not exists players_user_idx on players(user_id);

-- Magic-link auth (Phase 5 of friend-groups). Layers email-anchored
-- accounts on top of the existing device-bound identity so stats
-- survive cache wipes / device switches.
--
-- Device tokens become 1:N → user. The legacy users.device_token
-- column is left in place as a backwards-compat shim; new code
-- reads from this table exclusively. A follow-up migration can
-- drop the legacy column once nothing references it.
create table if not exists user_device_tokens (
  device_token text primary key,
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists user_device_tokens_user_idx
  on user_device_tokens(user_id);

-- Backfill: every existing users.device_token becomes a row.
-- Idempotent — re-running this migration is a no-op once seeded.
insert into user_device_tokens (device_token, user_id, created_at, last_seen_at)
select device_token, id, created_at, last_seen_at from users
where device_token is not null
on conflict (device_token) do nothing;

-- New code never writes users.device_token (it lives in
-- user_device_tokens now), so the legacy column must be nullable or
-- every new-user insert fails its NOT NULL constraint.
alter table users alter column device_token drop not null;

-- Email column on users. Nullable: device-only users persist forever.
-- Unique so two users can't claim the same email.
alter table users add column if not exists email text unique;

-- Magic link tokens. requesting_device_token lets the verify
-- endpoint know which device's stats to merge into the emailed
-- user (if any). Optional — sign-in from a fresh device leaves
-- it null and just attaches the new device to the email's user.
create table if not exists magic_link_tokens (
  token text primary key,
  email text not null,
  requesting_device_token text,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists magic_link_tokens_email_idx
  on magic_link_tokens(email);
create index if not exists magic_link_tokens_unused_idx
  on magic_link_tokens(used_at) where used_at is null;

-- Friend groups (Phase 2 of friend-groups). A group is an invite-only
-- social unit — anyone with the invite_code can join, owner can kick
-- and delete. Future phases attach matches to groups for stat
-- aggregation. Group ownership transfer is intentionally not built
-- yet — owners of multi-member groups can't leave until that lands.
create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text unique not null,
  owner_user_id uuid not null references users(id),
  created_at timestamptz not null default now()
);

-- Per-group membership. Each user has a per-group nickname distinct
-- from their default_nickname (so "Eric" in family group can be
-- "ericlovesgames" in work group). Cascade-delete from both sides
-- so leaving a group / deleting a user / deleting a group cleans up.
create table if not exists group_members (
  group_id uuid not null references groups(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  nickname text not null,
  role text not null default 'member', -- owner | member
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index if not exists group_members_user_idx
  on group_members(user_id);

-- One-identity migration. A person's identity is now authored once on
-- their users row (default_nickname / default_avatar). players.nickname
-- and group_members.nickname become denormalized snapshots written FROM
-- that identity, never typed fresh. group_members.nickname additionally
-- becomes an OPTIONAL per-group override: null = inherit the user's
-- identity (the normal case), set = override the display name in that
-- group only. The statements below are idempotent and safe to re-run.

-- 1. group_members.nickname is now nullable (null = inherit identity).
alter table group_members alter column nickname drop not null;

-- 2. Backfill the canonical identity for users who never authored one,
-- copying from their most recent players row so existing players keep
-- their name. Only touches users with a missing/empty default_nickname.
update users set default_nickname = sub.nickname
from (select distinct on (user_id) user_id, nickname from players
      where user_id is not null order by user_id, joined_at desc) sub
where users.id = sub.user_id
  and (users.default_nickname is null or users.default_nickname = '');

-- 3. Null out the broken "?" group memberships left by the old
-- default-nickname fallback so they inherit the user's identity instead.
update group_members set nickname = null where nickname = '?';

-- Match attribution (Phase 3 of friend-groups). A room can optionally
-- belong to a group — if set, the match-end flow snapshots a
-- match_results row for stat aggregation. Casual rooms (group_id
-- null) leave no persistent trace beyond rooms.match_history (the
-- existing lobby-scoped JSON column, which dies with the room).
alter table rooms
  add column if not exists group_id uuid references groups(id);
create index if not exists rooms_group_idx on rooms(group_id);

-- Persisted match results, lifetime per group. The `snapshot` column
-- holds the existing MatchHistoryEntry shape unchanged — no rewrite
-- of game-side types. game_kind tag mirrors rooms.kind.
create table if not exists match_results (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  room_code text not null,         -- not FK; rooms get GC'd
  game_kind text not null,         -- 'imposter' | 'wavelength' | 'just-one'
  ended_at timestamptz not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists match_results_group_ended_idx
  on match_results(group_id, ended_at desc);
create index if not exists match_results_group_game_idx
  on match_results(group_id, game_kind);

-- Per-player participation row per match. Lets stat queries
-- aggregate "Eric's imposter W/L" without re-parsing snapshot JSON.
-- Populated server-side alongside the match_results write.
--
-- role / won / delta are per-game-shaped:
--   imposter  → role: 'imposter' | 'crewmate', won: boolean, delta: int
--   wavelength→ role: 'psychic' | 'guesser',   won: boolean (top scorer), delta: int
--   just-one  → role: 'guesser' | 'clue-giver', won: null (cooperative), delta: 0/1
create table if not exists match_player_results (
  match_id uuid not null references match_results(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text,
  won boolean,
  delta int not null default 0,
  primary key (match_id, user_id)
);

create index if not exists mpr_user_idx on match_player_results(user_id);

-- Optional player avatar (emoji or single character). Falls back to
-- nickname's first letter if null.
alter table players add column if not exists avatar text;

-- Crewmate pair partner for mole_mode rooms. Two paired crewmates
-- have partner_id pointing at each other. Null for imposters and
-- for non-mole-mode rooms.
alter table players add column if not exists partner_id uuid;

create table if not exists clues (
  id bigserial primary key,
  room_code text not null references rooms(code) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  round int not null,
  word text not null,
  created_at timestamptz not null default now(),
  -- One clue per player per round. Prevents the race where /clue and
  -- /expire both insert at the deadline (the player's real word + the
  -- forfeit dash).
  unique (room_code, player_id, round)
);

create index if not exists clues_room_round_idx on clues(room_code, round);

-- Migration for existing dbs: drop duplicates (keep oldest), add the
-- constraint. Safe to re-run.
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'clues_room_code_player_id_round_key'
  ) then
    delete from clues a
    using clues b
    where a.id > b.id
      and a.room_code = b.room_code
      and a.player_id = b.player_id
      and a.round = b.round;
    alter table clues
      add constraint clues_room_code_player_id_round_key
      unique (room_code, player_id, round);
  end if;
end $$;

-- One row per (clue, player, emoji). Anonymous to other clients
-- (only aggregate counts and which emoji you yourself toggled).
create table if not exists clue_reactions (
  clue_id bigint not null references clues(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (clue_id, player_id, emoji)
);

create index if not exists clue_reactions_clue_idx
  on clue_reactions(clue_id);

create table if not exists votes (
  id bigserial primary key,
  room_code text not null references rooms(code) on delete cascade,
  voter_id uuid not null references players(id) on delete cascade,
  target_id uuid not null references players(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (room_code, voter_id)
);

-- Append-only event log used to wake up clients via Supabase Realtime.
-- Contains no secrets; clients refetch state via our API on each event.
create table if not exists room_events (
  id bigserial primary key,
  room_code text not null,
  kind text not null,
  created_at timestamptz not null default now()
);

create index if not exists room_events_room_idx on room_events(room_code, id);

-- RLS: block anon writes/reads on everything sensitive. Clients only
-- subscribe to realtime INSERTs on room_events (nothing sensitive there).
-- Server uses the service role to bypass RLS for all reads/writes.
alter table rooms enable row level security;
alter table players enable row level security;
alter table clues enable row level security;
alter table votes enable row level security;
alter table room_events enable row level security;
alter table clue_reactions enable row level security;
alter table users enable row level security;
alter table groups enable row level security;
alter table group_members enable row level security;
alter table user_device_tokens enable row level security;
alter table magic_link_tokens enable row level security;
alter table match_results enable row level security;
alter table match_player_results enable row level security;

-- Allow anon SELECT on room_events so realtime subscriptions pass RLS.
-- No policies on other tables = anon can't read them.
-- drop-then-create so the whole file stays re-runnable (create policy
-- has no "if not exists").
drop policy if exists "anon can read room_events" on room_events;
create policy "anon can read room_events"
  on room_events for select
  to anon
  using (true);

-- Enable realtime on room_events. Guarded so re-running the file
-- doesn't error with "table is already a member".
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'room_events'
  ) then
    alter publication supabase_realtime add table room_events;
  end if;
end $$;
