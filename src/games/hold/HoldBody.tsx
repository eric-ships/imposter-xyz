"use client";

// Hold room body. Rendered inside the shared room page chrome.
// Reads view.kind === 'hold' from the parent dispatch.
//
// Hold is a cooperative tower defense. Phases (view.gameState.phase):
//   planning — players build on a shared board, then ready up
//   reveal   — the resolved wave is re-simulated and animated
//   victory  — all waves survived
//   defeat   — the core fell
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import type { PublicRoomView } from "@/lib/game";
import {
  CORE_CELL,
  CORE_MAX_HP,
  ENEMY_SPECS,
  GRID_H,
  GRID_W,
  PATH,
  TOWER_SPECS,
  WAVES,
  isBuildable,
} from "./data";
import { simulateWave, type HoldFrame } from "./sim";
import {
  cellKey,
  sameCell,
  type Cell,
  type EnemyType,
  type HoldState,
  type Tower,
  type TowerType,
} from "./types";
import { playRevealStageChime, playTurnChime } from "@/lib/audio";
import type { MatchHistoryEntry } from "@/lib/match-history";
import { avatarFor } from "@/lib/avatar";
import { GameKindSwitcher } from "@/components/GameKindSwitcher";
import { GroupAttributionPill } from "@/components/GroupAttributionPill";
import { SquadPayoffCard } from "@/components/SquadPayoffCard";

// ── Visual constants ───────────────────────────────────────────────

const TOWER_COLOR: Record<TowerType, string> = {
  cannon: "#d9842b",
  arc: "#3b9ad9",
  frost: "#46c5d4",
  sniper: "#9b5cd0",
};
const TOWER_GLYPH: Record<TowerType, string> = {
  cannon: "C",
  arc: "A",
  frost: "F",
  sniper: "S",
};
const ENEMY_COLOR: Record<EnemyType, string> = {
  runner: "#7a8290",
  brute: "#c2443c",
  flier: "#a05cc8",
  shielded: "#2f9b8e",
};
const TOWER_ORDER: TowerType[] = ["cannon", "arc", "frost", "sniper"];

// ── Entry ──────────────────────────────────────────────────────────

function useHoldAudio(state: HoldState | undefined) {
  const prev = useRef<string | null>(null);
  const first = useRef(true);
  useEffect(() => {
    if (!state) return;
    const wasFirst = first.current;
    first.current = false;
    const key = `${state.phase}:${state.waveNumber}`;
    if (prev.current !== key) {
      const was = prev.current;
      prev.current = key;
      if (wasFirst || was === null) return;
      if (state.phase === "planning") playTurnChime();
      if (state.phase === "victory") playRevealStageChime(2);
      if (state.phase === "defeat") playRevealStageChime(0);
    }
  }, [state]);
}

export function HoldBody({
  view,
  playerId,
  code,
  userId,
}: {
  view: PublicRoomView;
  playerId: string;
  code: string;
  userId: string | null;
}) {
  const isHost = view.hostId === playerId;
  useHoldAudio(view.gameState as unknown as HoldState | undefined);

  if (view.state === "lobby") {
    return (
      <HoldLobby
        view={view}
        playerId={playerId}
        code={code}
        isHost={isHost}
        userId={userId}
      />
    );
  }

  const state = view.gameState as unknown as HoldState | undefined;
  if (!state || !state.phase) {
    return (
      <p className="text-center text-sm text-ink-soft">Loading mission…</p>
    );
  }

  return (
    <HoldMatch
      view={view}
      playerId={playerId}
      code={code}
      isHost={isHost}
      state={state}
    />
  );
}

// ── Lobby ──────────────────────────────────────────────────────────

function HoldLobby({
  view,
  playerId,
  code,
  isHost,
  userId,
}: {
  view: PublicRoomView;
  playerId: string;
  code: string;
  isHost: boolean;
  userId: string | null;
}) {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const count = view.players.length;
  const canStart = count >= 3 && count <= 5;

  async function start() {
    setError(null);
    setStarting(true);
    try {
      const res = await fetch(`/api/rooms/${code}/hold/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
      setStarting(false);
    }
  }

  return (
    <div className="space-y-7">
      <GameKindSwitcher
        code={code}
        playerId={playerId}
        isHost={isHost}
        currentKind={view.kind}
      />
      <div>
        <GroupAttributionPill
          code={code}
          playerId={playerId}
          userId={userId}
          isHost={isHost}
          isLobby
          currentGroupId={view.groupId}
          currentGroupName={view.groupName}
        />
      </div>

      <section className="space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-ink-faint">
          Crew · {count} aboard {count > 5 && "(needs 3-5)"}
        </h2>
        <ul className="divide-y divide-line-soft border-y border-line-soft">
          {view.players.map((p) => {
            const av = avatarFor(p.id, p.nickname, p.avatar, view.players);
            return (
              <li key={p.id} className="flex items-center gap-3 py-3">
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${av.color} ${
                    av.isCustom
                      ? "border-2 border-line text-base"
                      : "text-sm font-semibold text-white"
                  }`}
                >
                  {av.initial}
                </div>
                <span className="text-sm text-ink">
                  {p.nickname}
                  {p.id === view.hostId && (
                    <span className="ml-2 text-[10px] font-bold uppercase tracking-[0.18em] text-accent">
                      Host
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-3 rounded-xl border-2 border-line-soft bg-surface/40 p-4">
        <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-ink-faint">
          How Hold works
        </h3>
        <p className="text-sm text-ink-soft">
          A cooperative tower defense. Enemies march a fixed path to
          your shared <em>core</em>. Each round, everyone builds towers
          from their own budget — then the wave resolves and you watch
          it play out. Towers and enemies{" "}
          <span className="text-ink">counter each other</span>: spam one
          type and a wave will walk right through. Survive all{" "}
          {WAVES.length} waves to win.
        </p>
      </section>

      {isHost ? (
        <button
          onClick={start}
          disabled={!canStart || starting}
          className="w-full rounded-2xl bg-accent px-6 py-4 text-base font-bold tracking-tight text-white shadow-sm transition-all duration-100 hover:brightness-110 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-30"
        >
          {starting
            ? "Deploying…"
            : count < 3
              ? `Awaiting ${3 - count} more`
              : count > 5
                ? "Too many — Hold is 3-5"
                : "Hold the line"}
        </button>
      ) : (
        <p className="text-center text-[11px] uppercase tracking-[0.2em] text-ink-faint">
          Awaiting the host
        </p>
      )}

      {error && (
        <p className="border-l-2 border-oxblood bg-oxblood/5 px-4 py-2 text-sm text-oxblood">
          {error}
        </p>
      )}

      <HoldHistoryPanel history={view.matchHistory ?? []} />
    </div>
  );
}

// ── Match dispatch ─────────────────────────────────────────────────

function HoldMatch({
  view,
  playerId,
  code,
  isHost,
  state,
}: {
  view: PublicRoomView;
  playerId: string;
  code: string;
  isHost: boolean;
  state: HoldState;
}) {
  useDeadlineExpire(state.deadline, code);
  const nameById = new Map(view.players.map((p) => [p.id, p.nickname]));

  if (state.phase === "victory" || state.phase === "defeat") {
    return (
      <HoldEnd
        view={view}
        playerId={playerId}
        code={code}
        isHost={isHost}
        state={state}
        nameById={nameById}
      />
    );
  }
  if (state.phase === "reveal") {
    return (
      <HoldReveal
        playerId={playerId}
        code={code}
        isHost={isHost}
        state={state}
      />
    );
  }
  return (
    <HoldPlanning
      view={view}
      playerId={playerId}
      code={code}
      state={state}
      nameById={nameById}
    />
  );
}

// ── The board (SVG) ────────────────────────────────────────────────

const PATH_KEYSET = new Set(PATH.map(cellKey));

function HoldBoard({
  towers,
  frame,
  coreHp,
  selectedTowerId,
  onPick,
}: {
  towers: Tower[];
  frame?: HoldFrame | null;
  coreHp: number;
  selectedTowerId?: string | null;
  onPick?: (cell: Cell, tower: Tower | null) => void;
}) {
  const towerByCell = new Map(towers.map((t) => [cellKey(t.cell), t]));
  const sel = towers.find((t) => t.id === selectedTowerId) ?? null;

  const cells: Cell[] = [];
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) cells.push({ x, y });
  }

  return (
    <svg
      viewBox={`0 0 ${GRID_W} ${GRID_H}`}
      className="w-full rounded-xl border-2 border-line bg-surface/30"
      style={{ touchAction: "manipulation" }}
    >
      {/* Cells */}
      {cells.map((c) => {
        const onPath = PATH_KEYSET.has(cellKey(c));
        const buildable = isBuildable(c);
        return (
          <rect
            key={cellKey(c)}
            x={c.x}
            y={c.y}
            width={1}
            height={1}
            fill={onPath ? "var(--cream)" : "transparent"}
            stroke="var(--line-soft)"
            strokeWidth={0.02}
            onClick={
              onPick
                ? () => onPick(c, towerByCell.get(cellKey(c)) ?? null)
                : undefined
            }
            style={{
              cursor: onPick && buildable ? "pointer" : "default",
            }}
          />
        );
      })}

      {/* Path centerline */}
      <polyline
        points={PATH.map((c) => `${c.x + 0.5},${c.y + 0.5}`).join(" ")}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={0.08}
        strokeOpacity={0.4}
        strokeLinejoin="round"
      />

      {/* Spawn + core markers */}
      <circle
        cx={PATH[0].x + 0.5}
        cy={PATH[0].y + 0.5}
        r={0.22}
        fill="var(--ink-faint)"
      />
      <rect
        x={CORE_CELL.x + 0.12}
        y={CORE_CELL.y + 0.12}
        width={0.76}
        height={0.76}
        rx={0.12}
        fill={coreHp > 0 ? "var(--leaf)" : "var(--oxblood)"}
      />

      {/* Selected tower's range */}
      {sel && (
        <circle
          cx={sel.cell.x + 0.5}
          cy={sel.cell.y + 0.5}
          r={
            TOWER_SPECS[sel.type].range +
            (sel.level >= 2 ? TOWER_SPECS[sel.type].upgrade.range : 0)
          }
          fill="var(--accent)"
          fillOpacity={0.08}
          stroke="var(--accent)"
          strokeOpacity={0.3}
          strokeWidth={0.03}
        />
      )}

      {/* Towers */}
      {towers.map((t) => (
        <g key={t.id}>
          <circle
            cx={t.cell.x + 0.5}
            cy={t.cell.y + 0.5}
            r={0.36}
            fill={TOWER_COLOR[t.type]}
            stroke={
              t.id === selectedTowerId ? "var(--ink)" : "var(--surface)"
            }
            strokeWidth={t.id === selectedTowerId ? 0.08 : 0.04}
          />
          <text
            x={t.cell.x + 0.5}
            y={t.cell.y + 0.5}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={0.4}
            fill="#fff"
            fontWeight="700"
          >
            {TOWER_GLYPH[t.type]}
          </text>
          {t.level >= 2 && (
            <circle
              cx={t.cell.x + 0.82}
              cy={t.cell.y + 0.18}
              r={0.12}
              fill="var(--ink)"
            />
          )}
        </g>
      ))}

      {/* Shots */}
      {frame?.shots.map((s, i) => (
        <line
          key={i}
          x1={s.fromX + 0.5}
          y1={s.fromY + 0.5}
          x2={s.toX + 0.5}
          y2={s.toY + 0.5}
          stroke={TOWER_COLOR[s.type]}
          strokeWidth={0.06}
          strokeOpacity={0.8}
        />
      ))}

      {/* Enemies */}
      {frame?.enemies.map((e) => (
        <g key={e.id}>
          <circle
            cx={e.x + 0.5}
            cy={e.y + 0.5}
            r={0.28}
            fill={ENEMY_COLOR[e.type]}
            stroke="var(--surface)"
            strokeWidth={0.03}
          />
          <rect
            x={e.x + 0.18}
            y={e.y + 0.08}
            width={0.64 * e.hpFrac}
            height={0.08}
            fill="var(--leaf)"
          />
        </g>
      ))}

      {/* Death flashes */}
      {frame?.deaths.map((d, i) => (
        <circle
          key={`d${i}`}
          cx={d.x + 0.5}
          cy={d.y + 0.5}
          r={0.34}
          fill="none"
          stroke="var(--oxblood)"
          strokeWidth={0.07}
        />
      ))}
    </svg>
  );
}

function CoreHpBar({ hp, max }: { hp: number; max: number }) {
  const frac = Math.max(0, hp) / max;
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-bold uppercase tracking-[0.14em] text-ink-faint">
        Core
      </span>
      <div className="h-2.5 w-32 overflow-hidden rounded-full bg-line-soft">
        <div
          className={`h-full transition-all duration-300 ${
            frac > 0.4 ? "bg-leaf" : "bg-oxblood"
          }`}
          style={{ width: `${frac * 100}%` }}
        />
      </div>
      <span className="text-sm tabular-nums text-ink">
        {Math.max(0, hp)}/{max}
      </span>
    </div>
  );
}

// ── Planning phase ─────────────────────────────────────────────────

function waveSummary(waveNumber: number): string {
  const wave = WAVES[waveNumber];
  if (!wave) return "";
  const counts = new Map<EnemyType, number>();
  for (const e of wave.entries) {
    counts.set(e.enemy, (counts.get(e.enemy) ?? 0) + e.count);
  }
  return [...counts.entries()]
    .map(([t, n]) => `${n} ${ENEMY_SPECS[t].name}${n === 1 ? "" : "s"}`)
    .join(" · ");
}

function HoldPlanning({
  view,
  playerId,
  code,
  state,
  nameById,
}: {
  view: PublicRoomView;
  playerId: string;
  code: string;
  state: HoldState;
  nameById: Map<string, string>;
}) {
  const [tool, setTool] = useState<TowerType | null>(null);
  const [selectedTowerId, setSelectedTowerId] = useState<string | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mySupply = state.supply[playerId] ?? 0;
  const myReady = !!state.ready[playerId];
  const readyCount = state.order.filter((p) => state.ready[p]).length;

  async function post(path: string, body: unknown) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/rooms/${code}/hold/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  function pick(cell: Cell, tower: Tower | null) {
    if (busy) return;
    if (tower) {
      setSelectedTowerId((id) => (id === tower.id ? null : tower.id));
      return;
    }
    setSelectedTowerId(null);
    if (!tool) return;
    if (!isBuildable(cell)) return;
    if ((TOWER_SPECS[tool].cost ?? 0) > mySupply) {
      setError("Not enough supply.");
      return;
    }
    void post("place", { playerId, type: tool, cell });
  }

  const selTower = state.towers.find((t) => t.id === selectedTowerId);
  const selMine = selTower?.ownerId === playerId;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-bold uppercase tracking-[0.14em] text-ink-faint">
            Wave {state.waveNumber + 1} of {state.totalWaves} · incoming
          </span>
          <span className="text-sm text-ink">
            {waveSummary(state.waveNumber)}
          </span>
        </div>
        <CountdownPill deadline={state.deadline} />
      </div>

      <div className="flex items-center justify-between gap-3">
        <CoreHpBar hp={state.coreHp} max={state.coreMaxHp} />
        <span className="text-sm tabular-nums text-ink">
          Supply ·{" "}
          <span className="font-semibold text-accent">{mySupply}</span>
        </span>
      </div>

      <HoldBoard
        towers={state.towers}
        coreHp={state.coreHp}
        selectedTowerId={selectedTowerId}
        onPick={pick}
      />

      {/* Selected tower actions */}
      {selTower && (
        <div className="flex items-center gap-3 rounded-xl border-2 border-line-soft bg-surface/40 p-3">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white"
            style={{ background: TOWER_COLOR[selTower.type] }}
          >
            {TOWER_GLYPH[selTower.type]}
          </span>
          <span className="text-sm text-ink">
            {TOWER_SPECS[selTower.type].name} L{selTower.level}
            <span className="ml-1 text-ink-faint">
              · {nameById.get(selTower.ownerId) ?? "?"}
            </span>
          </span>
          {selMine ? (
            <span className="ml-auto flex gap-2">
              {selTower.level < 2 && (
                <button
                  disabled={busy}
                  onClick={() => {
                    void post("upgrade", {
                      playerId,
                      towerId: selTower.id,
                    });
                    setSelectedTowerId(null);
                  }}
                  className="rounded-xl border-2 border-accent/50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent disabled:opacity-40"
                >
                  Upgrade · {TOWER_SPECS[selTower.type].upgradeCost}
                </button>
              )}
              <button
                disabled={busy}
                onClick={() => {
                  void post("sell", { playerId, towerId: selTower.id });
                  setSelectedTowerId(null);
                }}
                className="rounded-xl border-2 border-oxblood/50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-oxblood disabled:opacity-40"
              >
                Sell
              </button>
            </span>
          ) : (
            <span className="ml-auto text-[11px] font-bold uppercase tracking-[0.16em] text-ink-faint">
              Not yours
            </span>
          )}
        </div>
      )}

      {/* Tower palette */}
      <section className="space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-ink-faint">
          Build {tool && "· tap an open tile"}
        </h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TOWER_ORDER.map((t) => {
            const spec = TOWER_SPECS[t];
            const active = tool === t;
            const afford = spec.cost <= mySupply;
            return (
              <button
                key={t}
                onClick={() => setTool((cur) => (cur === t ? null : t))}
                className={`flex flex-col gap-1 rounded-xl border-2 p-2.5 text-left transition ${
                  active
                    ? "border-accent bg-accent/10"
                    : "border-line-soft bg-surface/30"
                } ${!afford ? "opacity-45" : ""}`}
              >
                <span className="flex items-center gap-1.5">
                  <span
                    className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
                    style={{ background: TOWER_COLOR[t] }}
                  >
                    {TOWER_GLYPH[t]}
                  </span>
                  <span className="text-sm text-ink">{spec.name}</span>
                  <span className="ml-auto text-xs tabular-nums text-accent">
                    {spec.cost}
                  </span>
                </span>
                <span className="text-[10px] leading-tight text-ink-faint">
                  {spec.blurb}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {error && (
        <p className="border-l-2 border-oxblood bg-oxblood/5 px-4 py-2 text-sm text-oxblood">
          {error}
        </p>
      )}

      {/* Ready */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink-faint">
          {readyCount} of {state.order.length} ready
        </span>
        <button
          disabled={busy}
          onClick={() => post("ready", { playerId, ready: !myReady })}
          className={`rounded-xl px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.2em] transition-all active:scale-[0.97] disabled:opacity-40 ${
            myReady
              ? "border-2 border-leaf/50 bg-leaf/10 text-leaf"
              : "bg-ink text-page hover:bg-accent"
          }`}
        >
          {myReady ? "Ready ✓ — tap to undo" : "Ready to defend"}
        </button>
      </div>
    </div>
  );
}

// ── Reveal phase (wave replay) ─────────────────────────────────────

function HoldReveal({
  playerId,
  code,
  isHost,
  state,
}: {
  playerId: string;
  code: string;
  isHost: boolean;
  state: HoldState;
}) {
  const result = state.lastResult;
  const frames = useMemo(() => {
    if (!result) return [] as HoldFrame[];
    return simulateWave(state.towers, WAVES[result.waveNumber], result.waveNumber)
      .frames;
  }, [state.towers, result]);

  const [idx, setIdx] = useState(0);
  const done = idx >= frames.length - 1;

  useEffect(() => {
    if (frames.length === 0 || done) return;
    const id = setTimeout(
      () => setIdx((i) => Math.min(i + 1, frames.length - 1)),
      1000 / 24
    );
    return () => clearTimeout(id);
  }, [idx, done, frames.length]);

  // Core HP drains in step with leaks during the animation.
  const startCoreHp = state.coreHp + (result?.coreHpLost ?? 0);
  const drained = frames
    .slice(0, idx + 1)
    .reduce((sum, f) => sum + f.coreDamage, 0);
  const liveCoreHp = startCoreHp - drained;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function nextWave() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/rooms/${code}/hold/next-wave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-bold uppercase tracking-[0.14em] text-ink-faint">
          Wave {(result?.waveNumber ?? 0) + 1} · {done ? "resolved" : "incoming"}
        </span>
        {!done && (
          <button
            onClick={() => setIdx(frames.length - 1)}
            className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint transition hover:text-ink"
          >
            Skip ▸▸
          </button>
        )}
      </div>

      <CoreHpBar hp={liveCoreHp} max={state.coreMaxHp} />

      <HoldBoard
        towers={state.towers}
        frame={frames[idx] ?? null}
        coreHp={liveCoreHp}
      />

      {done && result && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className={`rounded-xl border-2 p-4 ${
            state.coreHp > 0
              ? "border-leaf/40 bg-leaf/5"
              : "border-oxblood/40 bg-oxblood/5"
          }`}
        >
          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-ink-faint">
            Wave {result.waveNumber + 1} report
          </div>
          <div className="mt-1 text-sm text-ink">
            {result.killed} destroyed · {result.leaked} leaked ·{" "}
            {result.coreHpLost > 0
              ? `${result.coreHpLost} core damage`
              : "core untouched"}
          </div>
        </motion.div>
      )}

      {error && (
        <p className="border-l-2 border-oxblood bg-oxblood/5 px-4 py-2 text-sm text-oxblood">
          {error}
        </p>
      )}

      {done &&
        (isHost ? (
          <button
            onClick={nextWave}
            disabled={busy}
            className="w-full rounded-2xl bg-accent px-6 py-4 text-base font-bold tracking-tight text-white shadow-sm transition-all hover:brightness-110 active:scale-[0.97] disabled:opacity-40"
          >
            {busy ? "…" : "Continue"}
          </button>
        ) : (
          <p className="text-center text-[11px] uppercase tracking-[0.2em] text-ink-faint">
            Awaiting the host
          </p>
        ))}
    </div>
  );
}

// ── Victory / defeat ───────────────────────────────────────────────

function HoldEnd({
  view,
  playerId,
  code,
  isHost,
  state,
  nameById,
}: {
  view: PublicRoomView;
  playerId: string;
  code: string;
  isHost: boolean;
  state: HoldState;
  nameById: Map<string, string>;
}) {
  const won = state.phase === "victory";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function playAgain() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/rooms/${code}/hold/play-again`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className={`rounded-xl border-2 p-6 text-center ${
          won
            ? "border-leaf/50 bg-leaf/5"
            : "border-oxblood/50 bg-oxblood/5"
        }`}
      >
        <div
          className={`text-[11px] font-bold uppercase tracking-[0.24em] ${
            won ? "text-leaf" : "text-oxblood"
          }`}
        >
          {won ? "The line held" : "The core fell"}
        </div>
        <div className="mt-2 font-serif text-4xl text-ink">
          {won ? "Victory" : "Wave " + (state.waveNumber + 1) + " broke through"}
        </div>
        <p className="mt-2 text-sm text-ink-soft">
          {won
            ? `All ${state.totalWaves} waves repelled with ${state.coreHp} core HP to spare.`
            : `Held for ${state.waveNumber} of ${state.totalWaves} waves.`}
        </p>
      </motion.div>

      <CoreHpBar hp={state.coreHp} max={state.coreMaxHp} />
      <HoldBoard towers={state.towers} coreHp={state.coreHp} />

      <section className="space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-ink-faint">
          Crew
        </h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {state.order.map((pid) => {
            const built = state.towers.filter(
              (t) => t.ownerId === pid
            ).length;
            return (
              <div
                key={pid}
                className="rounded-xl border-2 border-line-soft bg-surface/30 p-2 text-sm"
              >
                <div className="truncate text-ink">
                  {pid === playerId ? "You" : (nameById.get(pid) ?? "?")}
                </div>
                <div className="text-[11px] text-ink-faint">
                  {built} tower{built === 1 ? "" : "s"} standing
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {error && (
        <p className="border-l-2 border-oxblood bg-oxblood/5 px-4 py-2 text-sm text-oxblood">
          {error}
        </p>
      )}

      {view.you?.squadStanding && (
        <SquadPayoffCard standing={view.you.squadStanding} />
      )}

      {isHost ? (
        <button
          onClick={playAgain}
          disabled={busy}
          className="w-full rounded-2xl bg-accent px-6 py-4 text-base font-bold tracking-tight text-white shadow-sm transition-all hover:brightness-110 active:scale-[0.97] disabled:opacity-40"
        >
          {busy ? "Redeploying…" : "New defense"}
        </button>
      ) : (
        <p className="text-center text-[11px] uppercase tracking-[0.2em] text-ink-faint">
          Awaiting the host
        </p>
      )}

      <HoldHistoryPanel history={view.matchHistory ?? []} />
    </div>
  );
}

// ── History ────────────────────────────────────────────────────────

function HoldHistoryPanel({ history }: { history: MatchHistoryEntry[] }) {
  if (history.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-ink-faint">
        Past matches · {history.length}
      </h2>
      <div className="space-y-2">
        {history.map((m) => {
          let endedTime = "";
          try {
            endedTime = new Date(m.endedAt).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            });
          } catch {
            /* ignore */
          }
          if (!("kind" in m) || m.kind !== "hold") {
            return (
              <div
                key={`x${m.matchNumber}`}
                className="rounded-xl border-2 border-line-soft bg-page/40 px-3 py-2.5 text-[11px] font-bold uppercase tracking-[0.2em] text-ink-faint"
              >
                Match {m.matchNumber} · {"kind" in m ? m.kind : "imposter"}
                {endedTime && <> · {endedTime}</>}
              </div>
            );
          }
          const won = m.outcome === "victory";
          return (
            <div
              key={`h${m.matchNumber}`}
              className="rounded-xl border-2 border-line-soft bg-page/40 px-3 py-2.5"
            >
              <div className="flex items-baseline justify-between gap-3">
                <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-ink-faint">
                  Match {m.matchNumber} · Hold
                  {endedTime && <> · {endedTime}</>}
                </div>
                <div
                  className={`text-[11px] font-bold uppercase tracking-[0.18em] ${
                    won ? "text-leaf" : "text-oxblood"
                  }`}
                >
                  {won ? "Victory" : "Defeat"}
                </div>
              </div>
              <div className="mt-1 text-sm text-ink-soft">
                Reached wave {m.waveReached} of {m.totalWaves} · core{" "}
                {m.coreHp}/{CORE_MAX_HP}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Shared timer helpers ───────────────────────────────────────────

function useDeadlineExpire(deadline: string | null, code: string) {
  const firedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!deadline) return;
    if (firedFor.current === deadline) return;
    const ms = new Date(deadline).getTime() - Date.now();
    const fire = () => {
      firedFor.current = deadline;
      fetch(`/api/rooms/${code}/hold/expire`, { method: "POST" }).catch(
        () => {}
      );
    };
    if (ms <= 0) {
      fire();
      return;
    }
    const timer = setTimeout(fire, ms + 250);
    return () => clearTimeout(timer);
  }, [deadline, code]);
}

function CountdownPill({ deadline }: { deadline: string | null }) {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (!deadline) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [deadline]);
  if (!deadline) return null;
  const remaining = Math.max(
    0,
    Math.ceil((new Date(deadline).getTime() - now) / 1000)
  );
  const urgent = remaining <= 10;
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  return (
    <motion.span
      animate={urgent ? { scale: [1, 1.08, 1] } : { scale: 1 }}
      transition={
        urgent
          ? { duration: 1, repeat: Infinity, ease: "easeInOut" }
          : { duration: 0 }
      }
      className={`text-3xl font-semibold leading-none tabular-nums ${
        urgent ? "text-oxblood" : "text-ink"
      }`}
    >
      {mins}:{secs.toString().padStart(2, "0")}
    </motion.span>
  );
}
