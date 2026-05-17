// Pure state-transition helpers for Hold. No Supabase — the
// /api/rooms/[code]/hold/* routes call these and persist the result.
import {
  CORE_MAX_HP,
  isBuildable,
  ROUND_INCOME,
  SELL_REFUND,
  START_SUPPLY,
  TOWER_SPECS,
  WAVES,
} from "./data";
import { simulateWave } from "./sim";
import {
  HOLD_PLANNING_MS,
  cellKey,
  deadlineFromNow,
  sameCell,
  type Cell,
  type HoldState,
  type Tower,
  type TowerType,
} from "./types";

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Total supply a tower represents (cost + any upgrade) — the basis
// for the sell refund.
function towerSpend(tower: Tower): number {
  const spec = TOWER_SPECS[tower.type];
  return spec.cost + (tower.level >= 2 ? spec.upgradeCost : 0);
}

export function initMatch(playerIds: string[]): HoldState {
  const order = shuffle(playerIds);
  const supply: Record<string, number> = {};
  const ready: Record<string, boolean> = {};
  for (const pid of order) {
    supply[pid] = START_SUPPLY;
    ready[pid] = false;
  }
  return {
    phase: "planning",
    waveNumber: 0,
    totalWaves: WAVES.length,
    coreHp: CORE_MAX_HP,
    coreMaxHp: CORE_MAX_HP,
    towers: [],
    supply,
    ready,
    order,
    lastResult: null,
    deadline: deadlineFromNow(HOLD_PLANNING_MS),
  };
}

export function replayMatch(playerIds: string[]): HoldState {
  return initMatch(playerIds);
}

// Are all players done planning?
export function allReady(state: HoldState): boolean {
  return state.order.every((pid) => state.ready[pid]);
}

// Placing / upgrading / selling all un-ready the actor — they're
// clearly still building. Other players keep their ready flag.
function unready(
  ready: Record<string, boolean>,
  playerId: string
): Record<string, boolean> {
  return { ...ready, [playerId]: false };
}

export function placeTower(
  prev: HoldState,
  playerId: string,
  type: TowerType,
  cell: Cell
): HoldState {
  if (prev.phase !== "planning") return prev;
  if (!isBuildable(cell)) return prev;
  if (prev.towers.some((t) => sameCell(t.cell, cell))) return prev;
  const cost = TOWER_SPECS[type].cost;
  if ((prev.supply[playerId] ?? 0) < cost) return prev;

  const tower: Tower = {
    id: `${playerId}:${cellKey(cell)}`,
    ownerId: playerId,
    type,
    level: 1,
    cell,
  };
  return {
    ...prev,
    towers: [...prev.towers, tower],
    supply: { ...prev.supply, [playerId]: prev.supply[playerId] - cost },
    ready: unready(prev.ready, playerId),
  };
}

export function upgradeTower(
  prev: HoldState,
  playerId: string,
  towerId: string
): HoldState {
  if (prev.phase !== "planning") return prev;
  const tower = prev.towers.find((t) => t.id === towerId);
  if (!tower || tower.ownerId !== playerId) return prev;
  if (tower.level >= 2) return prev;
  const cost = TOWER_SPECS[tower.type].upgradeCost;
  if ((prev.supply[playerId] ?? 0) < cost) return prev;

  return {
    ...prev,
    towers: prev.towers.map((t) =>
      t.id === towerId ? { ...t, level: 2 } : t
    ),
    supply: { ...prev.supply, [playerId]: prev.supply[playerId] - cost },
    ready: unready(prev.ready, playerId),
  };
}

export function sellTower(
  prev: HoldState,
  playerId: string,
  towerId: string
): HoldState {
  if (prev.phase !== "planning") return prev;
  const tower = prev.towers.find((t) => t.id === towerId);
  if (!tower || tower.ownerId !== playerId) return prev;
  const refund = Math.floor(towerSpend(tower) * SELL_REFUND);

  return {
    ...prev,
    towers: prev.towers.filter((t) => t.id !== towerId),
    supply: {
      ...prev.supply,
      [playerId]: (prev.supply[playerId] ?? 0) + refund,
    },
    ready: unready(prev.ready, playerId),
  };
}

export function setReady(
  prev: HoldState,
  playerId: string,
  ready: boolean
): HoldState {
  if (prev.phase !== "planning") return prev;
  if (!(playerId in prev.ready)) return prev;
  return { ...prev, ready: { ...prev.ready, [playerId]: ready } };
}

// Run the current wave's simulation and bank the outcome. Always
// lands in 'reveal' so the client can animate; advanceWave then
// decides planning / victory / defeat.
export function resolveWave(prev: HoldState): HoldState {
  if (prev.phase !== "planning") return prev;
  const wave = WAVES[prev.waveNumber];
  if (!wave) return prev;
  const { result } = simulateWave(prev.towers, wave, prev.waveNumber);
  const coreHp = Math.max(0, prev.coreHp - result.coreHpLost);
  const ready: Record<string, boolean> = {};
  for (const pid of prev.order) ready[pid] = false;
  return {
    ...prev,
    phase: "reveal",
    coreHp,
    ready,
    lastResult: result,
    deadline: null,
  };
}

// reveal → next planning wave, or victory / defeat. Awards each
// player flat income plus an even share of the wave's bounty.
export function advanceWave(prev: HoldState): HoldState {
  if (prev.phase !== "reveal") return prev;
  if (prev.coreHp <= 0) return { ...prev, phase: "defeat" };
  if (prev.waveNumber + 1 >= prev.totalWaves) {
    return { ...prev, phase: "victory" };
  }

  const share = prev.lastResult
    ? Math.floor(prev.lastResult.bounty / prev.order.length)
    : 0;
  const supply: Record<string, number> = {};
  const ready: Record<string, boolean> = {};
  for (const pid of prev.order) {
    supply[pid] = (prev.supply[pid] ?? 0) + ROUND_INCOME + share;
    ready[pid] = false;
  }
  return {
    ...prev,
    phase: "planning",
    waveNumber: prev.waveNumber + 1,
    supply,
    ready,
    deadline: deadlineFromNow(HOLD_PLANNING_MS),
  };
}

// Idempotent planning-phase expiry: once the deadline passes the wave
// resolves with whatever is on the board.
export function expireMatch(prev: HoldState): HoldState {
  if (prev.phase !== "planning") return prev;
  if (!prev.deadline) return prev;
  if (Date.now() < new Date(prev.deadline).getTime()) return prev;
  return resolveWave(prev);
}

// Hold has no hidden information — the board is fully shared.
export function redactForViewer(
  state: HoldState,
  _viewerId: string | null
): HoldState {
  void _viewerId;
  return state;
}
