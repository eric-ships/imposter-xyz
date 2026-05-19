# Upper — theme guideline

Upper has **one theme**, in light and dark. It used to ship four
divergent palettes (parchment / noir / marine / bloom); that's retired.
One cohesive look, built so colour does the work.

## The idea

The brand is the **conic sweep** — four vivid accents cycling around a
ring. The UI ground stays clean and neutral so that colour pops: the
app icon, the loading indicator, the home wordmark and glow, and the
accent are where energy lives. Everything else is quiet.

## The conic — brand colours

| Colour  | Hex       | Role |
| ------- | --------- | ---- |
| Red     | `#d6471f` | first stop of the sweep |
| Gold    | `#f3ba26` | |
| Magenta | `#e0207a` | |
| Blue    | `#2f5cff` | |

Used as a sweep in: the app icon (`scripts/gen-icon.mjs`), the loader
(`UpperLoader`), the home wordmark fill and the home background glow.
The canonical gradient — keep these stops in sync if you reuse it:

```
conic-gradient(from 0deg, #d6471f 0deg, #f3ba26 110deg,
               #e0207a 220deg, #2f5cff 320deg, #d6471f 360deg)
```

Reach for the conic for **brand moments** (hero, icon, loader). Don't
scatter it through ordinary UI — it loses its punch.

## Tokens

Defined in `src/app/globals.css` as CSS variables, exposed to Tailwind
as `bg-page`, `text-ink`, `border-line`, `text-accent`, etc. Never
hard-code a UI colour — use a token, so light/dark both work.

| Token         | Light     | Dark      | Use |
| ------------- | --------- | --------- | --- |
| `page`        | `#e7e7ec` | `#0e0e11` | app background |
| `surface`     | `#ffffff` | `#1f1f25` | cards, raised panels |
| `cream`       | `#dcdce2` | `#2a2a31` | subtle hover / inset fills |
| `ink`         | `#16161c` | `#f1f1f4` | primary text |
| `ink-soft`    | `#4c4c56` | `#b2b2bc` | secondary text |
| `ink-faint`   | `#80808c` | `#82828e` | de-emphasized text, labels |
| `line`        | `#cfcfd8` | `#3a3a43` | borders |
| `line-soft`   | `#e0e0e6` | `#2a2a31` | hairline dividers |
| `accent`      | `#e8481c` | `#fc6438` | primary action - a vivid red-orange |
| `accent-soft` | `#f4a78f` | `#f9ac93` | accent tints / fills |
| `leaf`        | `#2f9e5e` | `#46b877` | success |
| `oxblood`     | `#cc2f2f` | `#e5705f` | error, destructive actions |

The UI ground is a deliberately cool, neutral grey ramp — warm brand
colour pops hardest against a cool ground, so `page` / `surface` /
`line` stay quiet and uncoloured. The `accent` is the one place warm
brand colour enters ordinary UI: a vivid red-orange, a punchier
sibling of the conic's red, retuned away from the muddy burnt tone it
carried over from the retired parchment palette.

## Type

- **Fraunces** (`font-serif`) — the wordmark and display headings.
  Italic for the "Upper" wordmark.
- **Inter** (`font-sans`, the default) — all UI text.

## Buttons

One light, smooth system — three tiers. Keep it calm: **1px borders
(`border`, never `border-2`)** and **restrained weight** — `font-medium`
for buttons and body, `font-semibold` only for headings and small
tracked labels, never `font-bold`/`extrabold`. No brutalist hard-offset
shadows (`shadow-[Npx_Npx_0]`); depth is soft (`shadow-sm` →
`hover:shadow-md`) and presses spring (`active:scale`).

- **Primary** — the one main action per view. `bg-accent`, white
  text, `rounded-2xl`, `shadow-sm hover:shadow-md hover:brightness-110`.
- **Secondary** — `border border-line`, `hover:border-ink`. An
  outline, no fill.
- **Ghost** — text only, or a faint `border border-line`. Tertiary /
  in-game controls. Never a heavy ink slab.

## Rules of thumb

- One primary action per view — `bg-accent`. Everything else is a
  quieter `border-line` / text button.
- `accent` is for action and brand; `oxblood` is for danger. Don't
  use red decoratively, or the two blur together.
- Text hierarchy is `ink` → `ink-soft` → `ink-faint`. Three steps,
  no more.
- Respect `prefers-reduced-motion` for anything that loops (the
  loader and the home glow already do).
- Light and dark must both hold up — test a change in both.
