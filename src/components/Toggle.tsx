"use client";

// Toggle — the chip-style two-state control used for room host
// options (police mode, jesus mode, moley moley mole, shortlist).
// Host clicks to flip; non-host viewers see a read-only chip
// displaying the current state. Same visual rhythm as the kit Button
// pills.
//
// One component, two render modes:
//   readOnly: false → interactive button, accent-filled when on
//   readOnly: true  → read-only span, accent-outlined when on
//
// Pending state shows "..." in place of the label. ARIA
// role="switch" with aria-checked for screen readers.
//
// I chose a chip toggle (not an iOS-style slide switch) because the
// host control panel is a vertical list — a stack of slide switches
// reads as "system settings", but a row of accent pills reads as
// "game options", which is the right vibe for a party game.

type ToggleProps = {
  enabled: boolean;
  onChange?: () => void;
  disabled?: boolean;
  pending?: boolean;
  readOnly?: boolean;
  // Tooltip on the read-only span, e.g. "Only the host can change this".
  readOnlyHint?: string;
  // Override the on/off labels (e.g. "Locked" / "Unlocked"). Defaults
  // to "On" / "Off".
  labels?: { on?: string; off?: string };
};

const BASE =
  "shrink-0 inline-flex items-center justify-center rounded-xl text-[11px] font-medium uppercase tracking-[0.2em] transition-all duration-100 outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-page";

const INTERACTIVE = `${BASE} px-4 py-2 active:scale-[0.96] disabled:opacity-40 disabled:active:scale-100`;
const READONLY = `${BASE} px-3 py-1 border`;

export function Toggle({
  enabled,
  onChange,
  disabled,
  pending,
  readOnly,
  readOnlyHint,
  labels,
}: ToggleProps) {
  const label = pending
    ? "..."
    : enabled
      ? (labels?.on ?? "On")
      : (labels?.off ?? "Off");

  if (readOnly) {
    return (
      <span
        role="switch"
        aria-checked={enabled}
        className={`${READONLY} ${
          enabled
            ? "border-accent/60 text-accent"
            : "border-line text-ink-faint"
        }`}
        title={readOnlyHint}
      >
        {label}
      </span>
    );
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={onChange}
      disabled={disabled || pending}
      className={`${INTERACTIVE} ${
        enabled
          ? "bg-accent text-page hover:bg-ink"
          : "border border-line text-ink hover:bg-ink hover:text-page"
      }`}
    >
      {label}
    </button>
  );
}
