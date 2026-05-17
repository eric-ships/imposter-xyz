"use client";

// GameVignettes — five small, self-contained looping animated SVGs,
// one per game, used as the visual on the new-visitor showcase
// cards. Each is deliberately quiet ambient motion: evocative of the
// game, never a cartoon. Everything is drawn with theme tokens
// (currentColor + Tailwind text-* utilities) so it adapts across all
// four palettes.
//
// Each vignette draws into a fixed 56x56 box. The wrapper card in
// page.tsx sizes the slot; these just fill it.
import { motion } from "motion/react";

const BOX = 56;

// Shared wrapper: a square SVG canvas with a non-distracting size.
function Canvas({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox={`0 0 ${BOX} ${BOX}`}
      width={BOX}
      height={BOX}
      fill="none"
      className="shrink-0"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

// ── Imposter — a row of five players (circles). One is the hidden
// imposter: tinted in oxblood and breathing on a quiet pulse while
// the others sit still. Reads as "one of these is not like the
// others" without shouting it.
export function ImposterVignette() {
  const cx = [8, 20, 32, 44, 53.5];
  const IMPOSTER = 2;
  return (
    <Canvas>
      {cx.map((x, i) =>
        i === IMPOSTER ? (
          <motion.circle
            key={i}
            cx={x}
            cy={28}
            r={5}
            className="fill-oxblood"
            animate={{ r: [5, 6.4, 5], opacity: [0.85, 1, 0.85] }}
            transition={{
              duration: 1.8,
              ease: "easeInOut",
              repeat: Infinity,
            }}
          />
        ) : (
          <circle
            key={i}
            cx={x}
            cy={28}
            r={5}
            className="fill-ink-faint"
          />
        )
      )}
    </Canvas>
  );
}

// ── Wavelength — a semicircular gauge with tick marks and a needle
// that sweeps smoothly back and forth across the spectrum, like a
// dial settling on a guess.
export function WavelengthVignette() {
  // Arc from 200° to 340° (a shallow dome over the pivot at 28,40).
  const pivot = { x: 28, y: 40 };
  const R = 22;
  // Tick marks along the arc.
  const ticks = [-70, -35, 0, 35, 70];
  return (
    <Canvas>
      {/* The gauge arc. */}
      <path
        d={`M ${pivot.x - R} ${pivot.y} A ${R} ${R} 0 0 1 ${
          pivot.x + R
        } ${pivot.y}`}
        className="stroke-line"
        strokeWidth={2.5}
        strokeLinecap="round"
      />
      {ticks.map((deg, i) => {
        const rad = ((deg - 90) * Math.PI) / 180;
        const inner = R - 5;
        return (
          <line
            key={i}
            x1={pivot.x + Math.cos(rad) * inner}
            y1={pivot.y + Math.sin(rad) * inner}
            x2={pivot.x + Math.cos(rad) * R}
            y2={pivot.y + Math.sin(rad) * R}
            className="stroke-ink-faint"
            strokeWidth={1.6}
            strokeLinecap="round"
          />
        );
      })}
      {/* The needle — rotates about the pivot, sweeping the spectrum. */}
      <motion.line
        x1={pivot.x}
        y1={pivot.y}
        x2={pivot.x}
        y2={pivot.y - R + 2}
        className="stroke-accent"
        strokeWidth={2.6}
        strokeLinecap="round"
        style={{ originX: `${pivot.x}px`, originY: `${pivot.y}px` }}
        animate={{ rotate: [-62, 62, -62] }}
        transition={{
          duration: 3.2,
          ease: "easeInOut",
          repeat: Infinity,
        }}
      />
      <circle cx={pivot.x} cy={pivot.y} r={3} className="fill-accent" />
    </Canvas>
  );
}

// ── Just One — cooperative clue-giving. A small stack of word-chips
// that fade in one after another, as if clues being laid down in
// sequence, then the set clears and the cycle restarts.
export function JustOneVignette() {
  const chips = [
    { x: 10, y: 14, w: 26 },
    { x: 18, y: 25, w: 30 },
    { x: 12, y: 36, w: 22 },
  ];
  const CYCLE = 3.2;
  return (
    <Canvas>
      {chips.map((c, i) => (
        <motion.g
          key={i}
          animate={{ opacity: [0, 0, 1, 1, 0] }}
          transition={{
            duration: CYCLE,
            ease: "easeInOut",
            repeat: Infinity,
            // Each chip lights a beat after the previous one.
            times: [0, i * 0.18, i * 0.18 + 0.14, 0.82, 1],
          }}
        >
          <rect
            x={c.x}
            y={c.y}
            width={c.w}
            height={8}
            rx={4}
            className="fill-accent"
          />
          {/* A faint "word" tick on the chip for texture. */}
          <rect
            x={c.x + 4}
            y={c.y + 3}
            width={c.w - 12}
            height={2}
            rx={1}
            className="fill-page"
            opacity={0.55}
          />
        </motion.g>
      ))}
    </Canvas>
  );
}

// ── Crew — co-op trick-taking. A hand of four cards that fan out
// from a tight stack and ease back in, repeating: the gesture of
// spreading a hand to read it.
export function CrewVignette() {
  // Resting fan angles for the four cards (degrees).
  const fan = [-21, -7, 7, 21];
  return (
    <Canvas>
      <g transform={`translate(${BOX / 2}, 44)`}>
        {fan.map((deg, i) => (
          <motion.g
            key={i}
            style={{ originX: "0px", originY: "0px" }}
            animate={{ rotate: [0, deg, 0] }}
            transition={{
              duration: 2.8,
              ease: "easeInOut",
              repeat: Infinity,
              repeatDelay: 0.4,
            }}
          >
            {/* Card body — drawn upright from the pivot at its bottom. */}
            <rect
              x={-8}
              y={-34}
              width={16}
              height={32}
              rx={3}
              className="fill-surface stroke-ink-soft"
              strokeWidth={1.6}
            />
            {/* A small accent pip so a card reads as a card. */}
            <circle cx={0} cy={-18} r={3} className="fill-accent" />
          </motion.g>
        ))}
      </g>
    </Canvas>
  );
}

// ── Hold — co-op tower defense. A tiny board: an L-shaped path, a
// tower at the corner, and an enemy dot that travels the path. The
// tower fires a brief shot line at the enemy as it passes.
export function HoldVignette() {
  // The path: enter top-left, run right, then drop down.
  // Enemy travels along it; we animate offsetDistance via a motion
  // path on a plain element instead, using keyframed cx/cy.
  const enemyX = [8, 8, 40, 40];
  const enemyY = [10, 10, 10, 46];
  const CYCLE = 3.4;
  return (
    <Canvas>
      {/* The path the enemy walks. */}
      <path
        d="M 8 10 H 40 V 46"
        className="stroke-line"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeDasharray="3 3"
      />
      {/* The tower — a stout shape near the path's bend. */}
      <rect
        x={20}
        y={28}
        width={12}
        height={12}
        rx={2}
        className="fill-ink-soft"
      />
      <rect
        x={23.5}
        y={23}
        width={5}
        height={6}
        rx={1.5}
        className="fill-accent"
      />
      {/* The shot — a quick line from the tower to the enemy, lit
          only for a fraction of the cycle. */}
      <motion.line
        x1={26}
        y1={26}
        x2={40}
        y2={10}
        className="stroke-accent"
        strokeWidth={2}
        strokeLinecap="round"
        animate={{ opacity: [0, 0, 1, 0, 0] }}
        transition={{
          duration: CYCLE,
          ease: "linear",
          repeat: Infinity,
          times: [0, 0.42, 0.5, 0.58, 1],
        }}
      />
      {/* The enemy dot, walking the path. */}
      <motion.circle
        r={4}
        className="fill-oxblood"
        animate={{ cx: enemyX, cy: enemyY }}
        transition={{
          duration: CYCLE,
          ease: "linear",
          repeat: Infinity,
          times: [0, 0.15, 0.6, 1],
        }}
      />
    </Canvas>
  );
}

// Lookup by game kind — lets page.tsx map a GAMES row to its vignette
// without a switch at the call site.
export const GAME_VIGNETTES: Record<string, () => React.ReactElement> = {
  imposter: ImposterVignette,
  wavelength: WavelengthVignette,
  "just-one": JustOneVignette,
  crew: CrewVignette,
  hold: HoldVignette,
};
