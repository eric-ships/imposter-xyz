"use client";

// GameVignettes — five small, looping animated SVGs, one per game,
// used as the visual on the landing-page showcase cards. Each sits
// in a 64x64 white chip and goes for pop: vivid brand colours, a
// distinct per-game gesture. Not cartoons, but not background
// wallpaper either.
//
// The chip is bg-white in both light and dark themes, so neutral
// strokes/fills are hardcoded near-black (`#16161c`) rather than the
// theme-adapting `ink` token (which would invert to light on dark and
// vanish on the white chip). Brand colours that read well in both
// themes (`accent`, `oxblood`) still use tokens.
import { useId } from "react";
import { motion } from "motion/react";

const BOX = 64;

// The hardcoded near-black used for neutral lines drawn on the chip.
const INK = "#16161c";

// Shared 64x64 SVG canvas. The chip wrapper in page.tsx sizes the
// slot; these just fill it.
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

// ── Imposter — a row of five colourful players. The middle one
// pulses a beat off from the others. Motion is the tell; the colour
// is camouflage. Exactly the game.
export function ImposterVignette() {
  return (
    <Canvas>
      <circle cx={7} cy={32} r={6} fill="#f3ba26" />
      <circle cx={19} cy={32} r={6} fill="#2f9e5e" />
      <motion.circle
        cx={32}
        cy={32}
        r={6}
        className="fill-accent"
        animate={{ r: [6, 8.5, 6], opacity: [1, 0.7, 1] }}
        transition={{
          duration: 1.5,
          ease: "easeInOut",
          repeat: Infinity,
        }}
      />
      <circle cx={45} cy={32} r={6} fill="#e0207a" />
      <circle cx={57} cy={32} r={6} fill="#2f5cff" />
    </Canvas>
  );
}

// ── Wavelength — a gauge with a spectrum-coloured arc and a needle
// that sweeps the full range. The gradient runs cool → warm so the
// sweep reads as scanning a spectrum.
export function WavelengthVignette() {
  const gradId = useId();
  const pivot = { x: 32, y: 46 };
  const R = 24;
  const ticks = [-72, -40, 0, 40, 72];
  return (
    <Canvas>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#2f5cff" />
          <stop offset="50%" stopColor="#f3ba26" />
          <stop offset="100%" stopColor="#e8481c" />
        </linearGradient>
      </defs>
      <path
        d={`M ${pivot.x - R} ${pivot.y} A ${R} ${R} 0 0 1 ${
          pivot.x + R
        } ${pivot.y}`}
        stroke={`url(#${gradId})`}
        strokeWidth={4}
        strokeLinecap="round"
        fill="none"
      />
      {ticks.map((deg, i) => {
        const rad = ((deg - 90) * Math.PI) / 180;
        const inner = R - 5;
        const outer = R + 1;
        return (
          <line
            key={i}
            x1={pivot.x + Math.cos(rad) * inner}
            y1={pivot.y + Math.sin(rad) * inner}
            x2={pivot.x + Math.cos(rad) * outer}
            y2={pivot.y + Math.sin(rad) * outer}
            stroke={INK}
            strokeWidth={1.8}
            strokeLinecap="round"
          />
        );
      })}
      <motion.line
        x1={pivot.x}
        y1={pivot.y}
        x2={pivot.x}
        y2={pivot.y - R + 2}
        stroke={INK}
        strokeWidth={3}
        strokeLinecap="round"
        style={{ originX: `${pivot.x}px`, originY: `${pivot.y}px` }}
        animate={{ rotate: [-68, 68, -68] }}
        transition={{
          duration: 2.6,
          ease: "easeInOut",
          repeat: Infinity,
        }}
      />
      <circle cx={pivot.x} cy={pivot.y} r={3.5} fill={INK} />
    </Canvas>
  );
}

// ── Just One — clue-laying. Three brightly-coloured chips slide in
// from the left, one after another, like written clues being placed
// on the table. They hold a beat and the cycle restarts.
export function JustOneVignette() {
  const chips = [
    { y: 14, w: 36, color: "#f3ba26" },
    { y: 28, w: 44, color: "#2f9e5e" },
    { y: 42, w: 32, color: "#2f5cff" },
  ];
  const CYCLE = 3.0;
  return (
    <Canvas>
      {chips.map((c, i) => (
        <motion.rect
          key={i}
          x={10}
          y={c.y}
          width={c.w}
          height={9}
          rx={4.5}
          fill={c.color}
          animate={{
            x: [-50, -50, 10, 10, -50],
            opacity: [0, 0, 1, 1, 0],
          }}
          transition={{
            duration: CYCLE,
            ease: "easeOut",
            repeat: Infinity,
            times: [0, i * 0.18, i * 0.18 + 0.12, 0.85, 1],
          }}
        />
      ))}
    </Canvas>
  );
}

// ── Crew — a fan of four cards, each in a different "suit" colour,
// spreading and resettling. The colour stands in for the suit; the
// gesture is the cards opening.
export function CrewVignette() {
  const fan = [
    { deg: -22, color: "#e8481c" },
    { deg: -8, color: "#f3ba26" },
    { deg: 8, color: "#2f9e5e" },
    { deg: 22, color: "#2f5cff" },
  ];
  return (
    <Canvas>
      <g transform={`translate(${BOX / 2}, 54)`}>
        {fan.map((c, i) => (
          <motion.g
            key={i}
            style={{ originX: "0px", originY: "0px" }}
            animate={{ rotate: [0, c.deg, 0] }}
            transition={{
              duration: 2.4,
              ease: "easeInOut",
              repeat: Infinity,
              repeatDelay: 0.3,
              delay: i * 0.08,
            }}
          >
            <rect
              x={-9}
              y={-40}
              width={18}
              height={36}
              rx={3}
              fill={c.color}
              stroke={INK}
              strokeWidth={1.5}
            />
          </motion.g>
        ))}
      </g>
    </Canvas>
  );
}

// ── Hold — a tiny lane. An enemy walks an L-shaped path; the tower
// at the bend fires a quick gold bolt as it passes. Cycle restarts.
export function HoldVignette() {
  const enemyX = [10, 10, 52, 52];
  const enemyY = [12, 12, 12, 52];
  const CYCLE = 2.8;
  return (
    <Canvas>
      <path
        d="M 10 12 H 52 V 52"
        stroke="#a8a8b0"
        strokeWidth={3}
        strokeLinecap="round"
        strokeDasharray="4 4"
        fill="none"
      />
      <rect x={24} y={32} width={16} height={18} rx={3} fill="#e8481c" />
      <rect x={28} y={26} width={8} height={8} rx={2} fill="#f3ba26" />
      <motion.line
        x1={32}
        y1={30}
        x2={52}
        y2={12}
        stroke="#f3ba26"
        strokeWidth={3}
        strokeLinecap="round"
        animate={{ opacity: [0, 0, 1, 0, 0] }}
        transition={{
          duration: CYCLE,
          ease: "linear",
          repeat: Infinity,
          times: [0, 0.42, 0.5, 0.58, 1],
        }}
      />
      <motion.circle
        r={5}
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
