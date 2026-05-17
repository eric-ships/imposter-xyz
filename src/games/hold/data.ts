// Static Hold content: the map, tower + enemy stats, the wave
// schedule, and economy constants. Imported by both the server (to
// resolve waves authoritatively) and the client (to render the board
// and re-run the simulator for the replay animation).
import type { Cell, EnemyType, TowerType, WaveDef } from "./types";

// ── Map ────────────────────────────────────────────────────────────

export const GRID_W = 13;
export const GRID_H = 9;

// Build a path by walking straight segments between waypoints. The
// enemy path; the last cell is the crew's core.
function buildPath(waypoints: Cell[]): Cell[] {
  const path: Cell[] = [waypoints[0]];
  for (let i = 1; i < waypoints.length; i++) {
    const from = waypoints[i - 1];
    const to = waypoints[i];
    const dx = Math.sign(to.x - from.x);
    const dy = Math.sign(to.y - from.y);
    let { x, y } = from;
    while (x !== to.x || y !== to.y) {
      x += dx;
      y += dy;
      path.push({ x, y });
    }
  }
  return path;
}

// An S-curve: in top-left, right, down, back left, down, right to the
// core on the far side.
export const PATH: Cell[] = buildPath([
  { x: 0, y: 1 },
  { x: 10, y: 1 },
  { x: 10, y: 7 },
  { x: 2, y: 7 },
  { x: 2, y: 4 },
  { x: 12, y: 4 },
]);

export const CORE_CELL: Cell = PATH[PATH.length - 1];

const PATH_KEYS = new Set(PATH.map((c) => `${c.x},${c.y}`));

// A tower may sit on any in-bounds cell that isn't on the path.
export function isBuildable(cell: Cell): boolean {
  if (cell.x < 0 || cell.x >= GRID_W) return false;
  if (cell.y < 0 || cell.y >= GRID_H) return false;
  return !PATH_KEYS.has(`${cell.x},${cell.y}`);
}

// ── Towers ─────────────────────────────────────────────────────────

export type TowerSpec = {
  name: string;
  blurb: string;
  cost: number;
  upgradeCost: number;
  range: number; // cells
  damage: number; // per shot
  fireEvery: number; // ticks between shots
  // cannon ignores armor; arc chains; frost is a slowing aura; sniper
  // reaches flying enemies.
  piercesArmor: boolean;
  chain: number; // extra targets hit per shot (0 = single target)
  slowFactor: number; // <1 = slows enemies in range; 1 = no slow
  hitsFlying: boolean;
  // Level-2 upgrade multipliers / bonuses.
  upgrade: { damage: number; range: number };
};

export const TOWER_SPECS: Record<TowerType, TowerSpec> = {
  cannon: {
    name: "Cannon",
    blurb: "Heavy single shots. Punches through armor; too slow for swarms.",
    cost: 6,
    upgradeCost: 6,
    range: 2.6,
    damage: 20,
    fireEvery: 28,
    piercesArmor: true,
    chain: 0,
    slowFactor: 1,
    hitsFlying: false,
    upgrade: { damage: 1.5, range: 0.5 },
  },
  arc: {
    name: "Arc",
    blurb: "Chains light damage across many targets. Shreds swarms; tickles armor.",
    cost: 5,
    upgradeCost: 5,
    range: 2.2,
    damage: 6,
    fireEvery: 14,
    piercesArmor: false,
    chain: 2,
    slowFactor: 1,
    hitsFlying: true,
    upgrade: { damage: 1.5, range: 0.4 },
  },
  frost: {
    name: "Frost",
    blurb: "Slows every enemy in range. Barely scratches — a force multiplier.",
    cost: 5,
    upgradeCost: 5,
    range: 2.4,
    damage: 0,
    fireEvery: 1,
    piercesArmor: false,
    chain: 0,
    slowFactor: 0.5,
    hitsFlying: true,
    upgrade: { damage: 0, range: 0.6 },
  },
  sniper: {
    name: "Sniper",
    blurb: "Long range, very slow, huge hits. The only answer to fliers.",
    cost: 8,
    upgradeCost: 8,
    range: 5.5,
    damage: 34,
    fireEvery: 46,
    piercesArmor: true,
    chain: 0,
    slowFactor: 1,
    hitsFlying: true,
    upgrade: { damage: 1.5, range: 0.7 },
  },
};

// ── Enemies ────────────────────────────────────────────────────────

export type EnemySpec = {
  name: string;
  hp: number;
  speed: number; // cells per second
  bounty: number;
  coreDamage: number;
  // brute: hits weaker than armorThreshold deal half.
  armored: boolean;
  // flier: only towers with hitsFlying can target it.
  flying: boolean;
  // shielded: the first `shield` hits are negated entirely.
  shield: number;
};

// Hits below this damage are halved against armored enemies.
export const ARMOR_THRESHOLD = 12;

export const ENEMY_SPECS: Record<EnemyType, EnemySpec> = {
  runner: {
    name: "Runner",
    hp: 14,
    speed: 2.2,
    bounty: 3,
    coreDamage: 1,
    armored: false,
    flying: false,
    shield: 0,
  },
  brute: {
    name: "Brute",
    hp: 110,
    speed: 0.8,
    bounty: 8,
    coreDamage: 4,
    armored: true,
    flying: false,
    shield: 0,
  },
  flier: {
    name: "Flier",
    hp: 30,
    speed: 1.6,
    bounty: 5,
    coreDamage: 2,
    armored: false,
    flying: true,
    shield: 0,
  },
  shielded: {
    name: "Shielded",
    hp: 36,
    speed: 1.3,
    bounty: 6,
    coreDamage: 2,
    armored: false,
    flying: false,
    shield: 3,
  },
};

// ── Waves ──────────────────────────────────────────────────────────

// Eight escalating waves. Each entry's startTick staggers the bursts;
// gap is the spacing within a burst (20 ticks = 1s).
export const WAVES: WaveDef[] = [
  // 1 — a gentle runner trickle
  { entries: [{ enemy: "runner", count: 6, gap: 22, startTick: 0 }] },
  // 2 — a bigger swarm
  { entries: [{ enemy: "runner", count: 11, gap: 16, startTick: 0 }] },
  // 3 — first armor
  {
    entries: [
      { enemy: "runner", count: 6, gap: 18, startTick: 0 },
      { enemy: "brute", count: 2, gap: 60, startTick: 40 },
    ],
  },
  // 4 — fliers arrive
  {
    entries: [
      { enemy: "flier", count: 5, gap: 26, startTick: 0 },
      { enemy: "runner", count: 8, gap: 14, startTick: 30 },
    ],
  },
  // 5 — shields
  {
    entries: [
      { enemy: "shielded", count: 5, gap: 30, startTick: 0 },
      { enemy: "runner", count: 8, gap: 12, startTick: 20 },
    ],
  },
  // 6 — armored push
  {
    entries: [
      { enemy: "brute", count: 4, gap: 44, startTick: 0 },
      { enemy: "flier", count: 4, gap: 30, startTick: 60 },
    ],
  },
  // 7 — everything, staggered
  {
    entries: [
      { enemy: "runner", count: 14, gap: 10, startTick: 0 },
      { enemy: "shielded", count: 4, gap: 36, startTick: 40 },
      { enemy: "flier", count: 5, gap: 28, startTick: 80 },
    ],
  },
  // 8 — the final push
  {
    entries: [
      { enemy: "brute", count: 5, gap: 34, startTick: 0 },
      { enemy: "shielded", count: 6, gap: 24, startTick: 30 },
      { enemy: "flier", count: 6, gap: 22, startTick: 70 },
      { enemy: "runner", count: 16, gap: 8, startTick: 60 },
    ],
  },
];

// ── Economy ────────────────────────────────────────────────────────

export const CORE_MAX_HP = 20;
export const START_SUPPLY = 14;
export const ROUND_INCOME = 9; // flat supply each player gets per round
export const SELL_REFUND = 0.6; // fraction of total spend refunded on sell
