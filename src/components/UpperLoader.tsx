"use client";

// UpperLoader — the brand loading indicator. The brand mark is an
// up-arrow, and the product is "Upper", so the loader literally reads
// as "going up": a vertical stack of bold up-chevrons that fire in a
// looping wave from bottom to top. Each chevron, in turn, pops up a
// notch and lights to full accent before settling back — so the eye
// is pulled upward over and over.
//
// Accent-colored (works across all four palettes), bold, and clearly
// in motion. Accepts an optional `size` prop (the pixel width the
// loader draws into; height scales with it).
import { motion } from "motion/react";

// One bold up-chevron, drawn as a thick round stroke so it stays
// crisp at any size and reads as a directional arrowhead.
function Chevron({ width }: { width: number }) {
  return (
    <svg
      width={width}
      height={width * 0.62}
      viewBox="0 0 32 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 16 L16 5 L28 16" />
    </svg>
  );
}

export function UpperLoader({ size = 40 }: { size?: number }) {
  // A stack of chevrons, fired bottom-to-top. The bottom-most is
  // index 0; we delay each one a little later so the highlight
  // travels upward, then the whole cycle repeats with a short pause.
  const COUNT = 4;
  const STEP = 0.16; // seconds between each chevron firing
  const POP = 0.46; // how long one chevron's pop lasts
  const CYCLE = COUNT * STEP + POP + 0.5; // full loop incl. rest

  // Each chevron is sized off `size`; the stack is a touch tighter
  // than the chevron height so the arrows visually overlap into one
  // continuous arrow shape.
  const chevW = size;
  const rowGap = size * 0.34;

  return (
    <span
      role="status"
      aria-label="Loading"
      className="inline-flex flex-col items-center text-accent"
      style={{ gap: rowGap }}
    >
      {/* Render top-to-bottom in the DOM, but the bottom chevron
          fires first — so the wave climbs. */}
      {Array.from({ length: COUNT }).map((_, row) => {
        // row 0 = top of the stack; the bottom row is COUNT-1 and
        // fires first.
        const fireOrder = COUNT - 1 - row;
        const delay = fireOrder * STEP;
        return (
          <motion.span
            key={row}
            className="inline-flex"
            initial={false}
            animate={{
              // Pop upward a notch, then settle.
              y: [0, -size * 0.34, 0],
              // Light from dim to full accent and back.
              opacity: [0.28, 1, 0.28],
              // A small punch in scale for the "pop".
              scale: [0.86, 1.12, 0.86],
            }}
            transition={{
              duration: POP,
              ease: "easeOut",
              repeat: Infinity,
              repeatDelay: CYCLE - POP,
              delay,
              times: [0, 0.4, 1],
            }}
          >
            <Chevron width={chevW} />
          </motion.span>
        );
      })}
    </span>
  );
}

export default UpperLoader;
