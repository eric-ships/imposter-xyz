// The Hold wave simulator. A deterministic, fixed-timestep simulation
// of one wave: no randomness anywhere, so the server (which needs the
// authoritative outcome) and the client (which needs frames to
// animate) run the exact same code on the exact same inputs and agree
// down to the last hit point.
//
// The server keeps only the small `result`; the client uses `frames`
// to drive the replay. Nothing frame-sized is ever persisted.
import {
  ARMOR_THRESHOLD,
  ENEMY_SPECS,
  PATH,
  TOWER_SPECS,
} from "./data";
import {
  HOLD_TICKS_PER_SEC,
  type EnemyType,
  type HoldResult,
  type Tower,
  type TowerType,
  type WaveDef,
} from "./types";

// Hard cap so a pathological wave can't loop forever (60s).
const MAX_TICKS = 60 * HOLD_TICKS_PER_SEC;

export type HoldFrame = {
  enemies: {
    id: number;
    type: EnemyType;
    x: number;
    y: number;
    hpFrac: number;
  }[];
  shots: {
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    type: TowerType;
  }[];
  deaths: { x: number; y: number }[];
  // Core damage dealt by enemies that leaked this tick — lets the
  // client drain the core HP bar in step with the animation.
  coreDamage: number;
};

type SimEnemy = {
  id: number;
  type: EnemyType;
  hp: number;
  maxHp: number;
  pathIndex: number; // fractional index into PATH
  shieldLeft: number;
  alive: boolean;
};

type SimTower = {
  tower: Tower;
  range: number;
  damage: number;
  cooldown: number;
};

// Interpolated (x, y) for a fractional path index.
function posAt(pathIndex: number): { x: number; y: number } {
  const last = PATH.length - 1;
  const i = Math.max(0, Math.min(Math.floor(pathIndex), last));
  const next = Math.min(i + 1, last);
  const frac = pathIndex - i;
  return {
    x: PATH[i].x + (PATH[next].x - PATH[i].x) * frac,
    y: PATH[i].y + (PATH[next].y - PATH[i].y) * frac,
  };
}

function dist(
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  return Math.hypot(ax - bx, ay - by);
}

// Effective (level-adjusted) stats for a placed tower.
function effectiveTower(tower: Tower): SimTower {
  const spec = TOWER_SPECS[tower.type];
  const lvl2 = tower.level >= 2;
  return {
    tower,
    range: spec.range + (lvl2 ? spec.upgrade.range : 0),
    damage: lvl2
      ? Math.round(spec.damage * spec.upgrade.damage)
      : spec.damage,
    cooldown: 0,
  };
}

// Apply one hit to an enemy, honoring shield then armor.
function applyHit(enemy: SimEnemy, rawDamage: number): void {
  if (enemy.shieldLeft > 0) {
    enemy.shieldLeft -= 1; // shield negates the hit entirely
    return;
  }
  let dmg = rawDamage;
  if (ENEMY_SPECS[enemy.type].armored && dmg < ARMOR_THRESHOLD) {
    dmg = dmg / 2;
  }
  enemy.hp -= dmg;
}

export function simulateWave(
  towers: Tower[],
  wave: WaveDef,
  waveNumber: number
): { result: HoldResult; frames: HoldFrame[] } {
  // Flatten the wave into a tick→enemyType spawn schedule.
  const schedule: { tick: number; type: EnemyType }[] = [];
  for (const entry of wave.entries) {
    for (let n = 0; n < entry.count; n++) {
      schedule.push({
        tick: entry.startTick + n * entry.gap,
        type: entry.enemy,
      });
    }
  }
  schedule.sort((a, b) => a.tick - b.tick);
  const totalEnemies = schedule.length;

  const simTowers = towers.map(effectiveTower);
  const frostTowers = simTowers.filter(
    (t) => TOWER_SPECS[t.tower.type].slowFactor < 1
  );

  const enemies: SimEnemy[] = [];
  const frames: HoldFrame[] = [];
  let nextSpawn = 0;
  let nextId = 1;
  let coreHpLost = 0;
  let bounty = 0;
  let leaked = 0;
  let killed = 0;

  for (let tick = 0; tick < MAX_TICKS; tick++) {
    const shots: HoldFrame["shots"] = [];
    const deaths: HoldFrame["deaths"] = [];
    let tickCoreDamage = 0;

    // 1. Spawn anything scheduled for this tick.
    while (
      nextSpawn < schedule.length &&
      schedule[nextSpawn].tick <= tick
    ) {
      const { type } = schedule[nextSpawn];
      const spec = ENEMY_SPECS[type];
      enemies.push({
        id: nextId++,
        type,
        hp: spec.hp,
        maxHp: spec.hp,
        pathIndex: 0,
        shieldLeft: spec.shield,
        alive: true,
      });
      nextSpawn++;
    }

    // 2. Move enemies along the path (slowed inside frost auras).
    for (const e of enemies) {
      if (!e.alive) continue;
      const spec = ENEMY_SPECS[e.type];
      const p = posAt(e.pathIndex);
      let factor = 1;
      for (const ft of frostTowers) {
        if (
          dist(p.x, p.y, ft.tower.cell.x, ft.tower.cell.y) <= ft.range
        ) {
          factor = Math.min(factor, TOWER_SPECS[ft.tower.type].slowFactor);
        }
      }
      e.pathIndex += (spec.speed * factor) / HOLD_TICKS_PER_SEC;
      // 3. Reached the core?
      if (e.pathIndex >= PATH.length - 1) {
        e.alive = false;
        coreHpLost += spec.coreDamage;
        tickCoreDamage += spec.coreDamage;
        leaked += 1;
      }
    }

    // 4. Towers fire.
    for (const st of simTowers) {
      const spec = TOWER_SPECS[st.tower.type];
      if (spec.slowFactor < 1) continue; // frost is a passive aura
      if (st.cooldown > 0) {
        st.cooldown -= 1;
        continue;
      }
      // Targets in range, valid (flying check), ordered closest to
      // the core first (highest pathIndex), id as a stable tiebreak.
      const inRange = enemies
        .filter((e) => e.alive)
        .filter((e) => !ENEMY_SPECS[e.type].flying || spec.hitsFlying)
        .filter((e) => {
          const p = posAt(e.pathIndex);
          return (
            dist(p.x, p.y, st.tower.cell.x, st.tower.cell.y) <= st.range
          );
        })
        .sort((a, b) =>
          b.pathIndex !== a.pathIndex
            ? b.pathIndex - a.pathIndex
            : a.id - b.id
        );
      if (inRange.length === 0) continue;

      const targets = inRange.slice(0, 1 + spec.chain);
      for (const target of targets) {
        const tp = posAt(target.pathIndex);
        shots.push({
          fromX: st.tower.cell.x,
          fromY: st.tower.cell.y,
          toX: tp.x,
          toY: tp.y,
          type: st.tower.type,
        });
        applyHit(target, st.damage);
        if (target.hp <= 0 && target.alive) {
          target.alive = false;
          killed += 1;
          bounty += ENEMY_SPECS[target.type].bounty;
          deaths.push({ x: tp.x, y: tp.y });
        }
      }
      st.cooldown = spec.fireEvery;
    }

    // 5. Snapshot the frame for the replay.
    frames.push({
      enemies: enemies
        .filter((e) => e.alive)
        .map((e) => {
          const p = posAt(e.pathIndex);
          return {
            id: e.id,
            type: e.type,
            x: p.x,
            y: p.y,
            hpFrac: Math.max(0, e.hp / e.maxHp),
          };
        }),
      shots,
      deaths,
      coreDamage: tickCoreDamage,
    });

    // Done once everything has spawned and nothing is left alive.
    const anyAlive = enemies.some((e) => e.alive);
    if (nextSpawn >= schedule.length && !anyAlive) break;
  }

  return {
    result: {
      waveNumber,
      coreHpLost,
      bounty,
      leaked,
      killed: Math.min(killed, totalEnemies),
    },
    frames,
  };
}
