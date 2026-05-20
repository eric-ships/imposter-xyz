"use client";

// UpperLoader — the brand loading indicator. It's the Upper app icon
// brought to life: the four-accent conic sweep (red → gold → magenta →
// blue) turns continuously beneath the static white up-arrow, so the
// mark itself reads as "loading". Honors prefers-reduced-motion by
// holding still.
//
// `size` is the pixel width/height of the square mark.
import { motion, useReducedMotion } from "motion/react";

// The same four-accent sweep as the app icon — see scripts/gen-icon.mjs.
// Anchors come from the brand tokens in globals.css; CSS resolves the
// var() references inside the gradient string at paint time.
const CONIC =
  "conic-gradient(from 0deg, var(--upper-red) 0deg, var(--upper-gold) 110deg, var(--upper-magenta) 220deg, var(--upper-blue) 320deg, var(--upper-red) 360deg)";

// The app icon's up-arrow silhouette, in a 64×64 box.
const ARROW = "M32 11 L55 34 L42 34 L42 55 L22 55 L22 34 L9 34 Z";

export function UpperLoader({ size = 40 }: { size?: number }) {
  const reduced = useReducedMotion();

  return (
    <span
      role="status"
      aria-label="Loading"
      className="relative inline-block overflow-hidden"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.22, // matches the icon's corner radius
      }}
    >
      {/* The conic sweep. Sized to 150% so its corners never expose a
          gap as it turns — a square that wide always covers the frame
          at every angle. */}
      <motion.span
        aria-hidden
        className="absolute block"
        style={{
          width: "150%",
          height: "150%",
          left: "-25%",
          top: "-25%",
          background: CONIC,
        }}
        animate={reduced ? undefined : { rotate: 360 }}
        transition={
          reduced
            ? undefined
            : { duration: 1.2, ease: "linear", repeat: Infinity }
        }
      />
      {/* The up-arrow, held still on top — the fixed point the colour
          turns beneath. */}
      <svg
        aria-hidden
        viewBox="0 0 64 64"
        width={size}
        height={size}
        className="absolute inset-0"
      >
        <path d={ARROW} fill="#FFFDF8" />
      </svg>
    </span>
  );
}

export default UpperLoader;
