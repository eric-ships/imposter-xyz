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
alter table rooms enable row level security;
alter table players enable row level security;
alter table clues enable row level security;
alter table votes enable row level security;
alter table room_events enable row level security;
alter table clue_reactions enable row level security;

-- Allow anon SELECT on room_events so realtime subscriptions pass RLS.
-- No policies on other tables = anon can't read them.
create policy "anon can read room_events"
  on room_events for select
  to anon
  using (true);

-- Enable realtime on room_events
alter publication supabase_realtime add table room_events;
