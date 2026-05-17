"use client";

// UpperLoader — the brand loading indicator. The brand mark is an
// up-arrow, and the product is "Upper", so the loader literally
// flows upward: three chevrons stacked in a column, each rising and
// fading on a staggered infinite loop. The effect is a continuous
// upward current — a new chevron emerges at the bottom as the one
// above it rises out the top.
//
// Accent-colored (so it works across all four palettes), small by
// default, and purely ambient. Accepts an optional `size` prop (the
// pixel width/height of the square it draws into).
import { motion } from "motion/react";

// One chevron of the up-arrow mark. Drawn as a stroke so it stays
// crisp at any size and reads as "motion" rather than a solid glyph.
function Chevron() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-full w-full"
    >
      <path d="M5 15 L12 8 L19 15" />
    </svg>
  );
}

export function UpperLoader({ size = 40 }: { size?: number }) {
  // Three chevrons share one travel cycle, offset by a third each so
  // the column always reads as a steady upward flow with no gap.
  const COUNT = 3;
  const CYCLE = 1.5; // seconds for one chevron to traverse + reset

  return (
    <span
      role="status"
      aria-label="Loading"
      className="relative inline-block text-accent"
      style={{ width: size, height: size }}
    >
      {Array.from({ length: COUNT }).map((_, i) => (
        <motion.span
          key={i}
          className="absolute left-0"
          style={{
            // Each chevron is a third of the box tall; the column of
            // three exactly fills the square at rest.
            width: size,
            height: size / 3,
          }}
          initial={false}
          animate={{
            // Rise by one box-height over the cycle.
            y: [size, -size / 3],
            // Fade in as it enters, fade out as it leaves the top.
            opacity: [0, 1, 1, 0],
          }}
          transition={{
            duration: CYCLE,
            ease: "linear",
            repeat: Infinity,
            delay: (CYCLE / COUNT) * i,
            opacity: {
              duration: CYCLE,
              ease: "easeInOut",
              repeat: Infinity,
              delay: (CYCLE / COUNT) * i,
              times: [0, 0.2, 0.8, 1],
            },
          }}
        >
          <Chevron />
        </motion.span>
      ))}
    </span>
  );
}

export default UpperLoader;
