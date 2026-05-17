// Hold game state. Lives in rooms.game_state jsonb when
// rooms.kind === 'hold'. Server-authoritative.
//
// Hold is a cooperative tower defense. Enemies march a fixed path
// toward the crew's core. Each round players build during a planning
// phase, then the wave is simulated and replayed. Survive every wave
// to win.
//
// Phases:
//   planning — players place / upgrade / sell towers, then ready up
//   reveal   — the wave that just resolved is animated; host advances
//   victory  — all waves survived, core HP > 0
//   defeat   — core HP hit 0
//
// There is no hidden information — the board is shared — so the
// public view is unredacted.
export type HoldPhase = "planning" | "reveal" | "victory" | "defeat";

export type TowerType = "cannon" | "arc" | "frost" | "sniper";
export type EnemyType = "runner" | "brute" | "flier" | "shielded";

export type Cell = { x: number; y: number };

export type Tower = {
  id: string;
  ownerId: string;
  type: TowerType;
  level: number; // 1 (placed) or 2 (upgraded)
  cell: Cell;
};

// One scheduled burst of enemies inside a wave.
export type SpawnEntry = {
  enemy: EnemyType;
  count: number;
  gap: number; // ticks between consecutive spawns
  startTick: number; // tick the first one appears
};

export type WaveDef = {
  entries: SpawnEntry[];
};

// The outcome of one resolved wave. Small — this is what the server
// persists. The client re-runs the (deterministic) simulator to
// animate; it never needs a stored frame log.
export type HoldResult = {
  waveNumber: number;
  coreHpLost: number;
  bounty: number;
  leaked: number; // enemies that reached the core
  killed: number;
};

export type HoldState = {
  phase: HoldPhase;
  waveNumber: number; // 0-indexed; the wave being planned / just resolved
  totalWaves: number;
  coreHp: number;
  coreMaxHp: number;
  towers: Tower[];
  // Per-player build budget.
  supply: Record<string, number>;
  // Per-player "done planning" flag; the wave resolves when all true.
  ready: Record<string, boolean>;
  order: string[]; // seat order
  // The wave just resolved — drives the reveal animation + summary.
  lastResult: HoldResult | null;
  // Planning-phase deadline (ISO). Null outside planning.
  deadline: string | null;
};

// Fixed simulation rate. Server and client both step at this rate so
// the deterministic simulator agrees on both sides.
export const HOLD_TICKS_PER_SEC = 20;

// Planning window. Generous — building is the thinky part — but
// bounded so one idle player can't stall the room.
export const HOLD_PLANNING_MS = 120_000;

export function deadlineFromNow(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

export function cellKey(c: Cell): string {
  return `${c.x},${c.y}`;
}

export function sameCell(a: Cell, b: Cell): boolean {
  return a.x === b.x && a.y === b.y;
}
