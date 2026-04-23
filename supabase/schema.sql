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

-- Casual mode: when true, the candidate shortlist is generated at game
-- start and visible to everyone the whole match (not just during the
-- caught-imposter guess phase). Host toggles in the lobby.
alter table rooms
  add column if not exists show_candidates_always boolean not null default false;

-- Multi-imposter support. For 5-player rooms we seat 2 imposters; 3-4
-- stays at 1. imposter_id (singular, older column) stays populated with
-- the *first* imposter so legacy reads still work. caught_imposter_id
-- is the specific imposter the crew caught in the vote — that person
-- takes the guess.
alter table rooms add column if not exists imposter_ids uuid[] not null default '{}';
alter table rooms add column if not exists caught_imposter_id uuid;

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

create table if not exists clues (
  id bigserial primary key,
  room_code text not null references rooms(code) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  round int not null,
  word text not null,
  created_at timestamptz not null default now()
);

create index if not exists clues_room_round_idx on clues(room_code, round);

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
alter table rooms enable row level security;
alter table players enable row level security;
alter table clues enable row level security;
alter table votes enable row level security;
alter table room_events enable row level security;

-- Allow anon SELECT on room_events so realtime subscriptions pass RLS.
-- No policies on other tables = anon can't read them.
create policy "anon can read room_events"
  on room_events for select
  to anon
  using (true);

-- Enable realtime on room_events
alter publication supabase_realtime add table room_events;
