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
| Red     | `#d6471f` | first stop; also the UI accent |
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
| `page`        | `#f4f4f6` | `#121214` | app background |
| `surface`     | `#ffffff` | `#1d1d20` | cards, raised panels |
| `cream`       | `#ebebef` | `#26262b` | subtle hover / inset fills |
| `ink`         | `#16161c` | `#f1f1f4` | primary text |
| `ink-soft`    | `#4c4c56` | `#b2b2bc` | secondary text |
| `ink-faint`   | `#8c8c98` | `#75757f` | de-emphasized text, labels |
| `line`        | `#e2e2e8` | `#33333a` | borders |
| `line-soft`   | `#ededf1` | `#26262b` | hairline dividers |
| `accent`      | `#d6471f` | `#f4633a` | primary action, brand red |
| `accent-soft` | `#ef9b7e` | `#f0a589` | accent tints / fills |
| `leaf`        | `#2f9e5e` | `#46b877` | success |
| `oxblood`     | `#cc2f2f` | `#e5705f` | error, destructive actions |

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
