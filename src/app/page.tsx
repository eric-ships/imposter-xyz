"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { useIdentity, getOrMintDeviceToken, signOut } from "@/lib/identity";
import { avatarFor } from "@/lib/avatar";
import { UpperLoader } from "@/components/UpperLoader";
import { GAME_VIGNETTES } from "@/components/GameVignettes";
import { Button, buttonClasses } from "@/components/Button";
import { Modal } from "@/components/Modal";

type Mode = "choose" | "create" | "join";

// All five games. `kind` matches the room-creation API; `sub` is the
// player-count + one-liner shown under the serif name. Used by both
// the new-visitor showcase and the create-flow picker, so there's a
// single source of truth for the roster.
type GameKind = "imposter" | "wavelength" | "just-one" | "crew" | "hold";

const GAMES: { kind: GameKind; title: string; sub: string }[] = [
  { kind: "imposter", title: "Imposter", sub: "3–8 · social deduction" },
  { kind: "wavelength", title: "Wavelength", sub: "3–6 · spectrum guessing" },
  { kind: "just-one", title: "Just One", sub: "3–7 · cooperative clues" },
  { kind: "crew", title: "Crew", sub: "3–5 · co-op trick-taking" },
  { kind: "hold", title: "Hold", sub: "3–5 · co-op tower defense" },
];

// One bold brand colour per game card — each one is a sample from
// the brand conic so the lineup reads as a slice of the same sweep,
// not five arbitrary hues.
//
// The conic stops are red (0°), gold (110°), magenta (220°), blue
// (320°). Cards take the three exact stops + two interpolations
// (purple at 270° between magenta and blue, deep amber at 55° between
// red and gold). Gold's native #f3ba26 is too light for white text —
// the amber slot uses a darkened conic gold (#c47416) that passes
// WCAG AA on white. All five are still dark enough for white text
// and the vignette art's white badge.
const CARD_COLORS = [
  "#d6471f", // red — imposter      · conic 0°
  "#2f5cff", // blue — wavelength   · conic 320°
  "#e0207a", // magenta — just one  · conic 220°
  "#873ebc", // purple — crew       · conic 270° (magenta↔blue midpoint)
  "#c47416", // amber — hold        · conic gold darkened for contrast
];

// Card backgrounds use a subtle within-hue gradient — same brand
// colour at the top-left, mixed toward black at the bottom-right.
// Reads as a soft "lit from above" depth without changing identity
// or contrast with the white text. color-mix(in srgb …) is widely
// supported in Baseline 2024+.
function cardGradient(color: string): string {
  return `linear-gradient(135deg, ${color} 0%, color-mix(in srgb, ${color} 72%, black) 100%)`;
}

// The brand conic sweep — the four-accent gradient of the app icon
// (scripts/gen-icon.mjs) and the loader. The home page wears it too.
const BRAND_CONIC =
  "conic-gradient(from 0deg, #d6471f 0deg, #f3ba26 110deg, #e0207a 220deg, #2f5cff 320deg, #d6471f 360deg)";

// "Upper" wordmark — a vivid red→magenta→blue gradient serif, the
// home page's loud anchor. With background-clip:text, any glyph ink
// outside the element box renders transparent — so the leading is
// loosened, a little bottom padding added for the p descenders, and
// right padding for the italic R's terminal (sized in em so it
// scales correctly across the text-7xl / text-8xl call sites — at
// text-8xl the italic R overhangs ~12px, 0.08em wasn't enough).
// `className` carries size.
function Wordmark({ className = "" }: { className?: string }) {
  return (
    <h1
      className={`font-serif italic leading-[1.05] tracking-tight pb-[0.16em] pr-[0.18em] ${className}`}
      style={{
        backgroundImage:
          "linear-gradient(105deg, #d6471f 0%, #e0207a 52%, #2f5cff 100%)",
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        color: "transparent",
      }}
    >
      Upper
    </h1>
  );
}

// A slow, blurred conic glow behind the whole page — the app icon's
// sweep turned into ambient energy. Honors prefers-reduced-motion.
function ConicBackdrop() {
  const reduced = useReducedMotion();
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {/* A zero-size anchor at the top-right viewport corner. */}
      <div className="absolute right-0 top-0 h-0 w-0">
        {/* The conic sweep, centred on that corner — its muddy
            convergence point tucks into the corner, so the page gets
            a clean fan of distinct brand colour. Turns slowly. */}
        <motion.div
          className="conic-glow"
          style={{
            width: "190vmax",
            height: "190vmax",
            marginLeft: "-95vmax",
            marginTop: "-95vmax",
            background: BRAND_CONIC,
            filter: "blur(64px)",
            opacity: 0.22,
          }}
          animate={reduced ? undefined : { rotate: 360 }}
          transition={
            reduced
              ? undefined
              : { duration: 48, ease: "linear", repeat: Infinity }
          }
        />
      </div>
    </div>
  );
}

// Section heading — bolder than the old hairline tracked label.
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">
      {children}
    </h2>
  );
}

// Module-scoped cache for the home data. The / ↔ /home redirect
// remounts HomePage; seeding state from this lets the remount render
// straight away rather than flashing the splash and refetching.
let cachedGroups: GroupRow[] | null = null;
let cachedTotalMatches: number | null = null;

export default function HomePage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("choose");
  const [joinCode, setJoinCode] = useState("");
  // Identity bootstrap: ensures the device has a userId in
  // localStorage, upserts the users row server-side, bumps presence.
  // userId is forwarded into create/join calls so the resulting
  // players row is bound to this device's user.
  const identity = useIdentity();
  // One-identity: a person names themselves ONCE, on `users`. After a
  // save we don't get a fresh identity ping, so we mirror it locally.
  // `name` resolves to the local edit first, then the bootstrapped
  // identity. Create/join flows read from this — they never ask for a
  // name once one is set.
  const [localName, setLocalName] = useState<string | null>(null);
  const name = (localName ?? identity.defaultNickname ?? "").trim();
  const hasName = name.length > 0;
  // Signed in = has a real account (email or Discord), as opposed to a
  // device-only local identity. Drives whether the top-right shows the
  // account menu or a plain "Sign in" entry.
  const signedIn = !!(identity.email || identity.discordLinked);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The display-name prompt is dismissible for this page load.
  const [namePromptDismissed, setNamePromptDismissed] = useState(false);

  // Shared across the live banner + groups section: the user's groups
  // (with live-room info) and their total-matches count. Lifted here
  // so the top-of-page activity banner and MyGroupsSection read the
  // same data without duplicate fetches. Seeded from the module cache
  // so the / ↔ /home redirect's remount renders instantly instead of
  // flashing the splash a second time.
  const [groups, setGroups] = useState<GroupRow[] | null>(cachedGroups);
  const [totalMatches, setTotalMatches] = useState<number | null>(
    cachedTotalMatches
  );

  const refetchGroups = useCallback(async () => {
    if (!identity.userId) return;
    try {
      const res = await fetch(`/api/groups?userId=${identity.userId}`);
      const data = await res.json();
      if (res.ok) {
        cachedGroups = data.groups as GroupRow[];
        setGroups(data.groups as GroupRow[]);
      }
    } catch {
      /* leave previous value */
    }
  }, [identity.userId]);

  useEffect(() => {
    refetchGroups();
  }, [refetchGroups]);

  useEffect(() => {
    if (!identity.userId) return;
    let cancelled = false;
    fetch(`/api/users/me/stats?userId=${identity.userId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        const matches = (d as PersonalStats).totalMatches;
        cachedTotalMatches = matches;
        setTotalMatches(matches);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [identity.userId]);

  function savePlayer(code: string, playerId: string, nickname: string) {
    localStorage.setItem(`ci:${code}:playerId`, playerId);
    localStorage.setItem(`ci:${code}:nickname`, nickname);
  }

  // Instant create: a fresh Imposter room, no pre-flow. The host picks
  // a different game and attributes a squad from the lobby. `uid` and
  // `displayName` are passed when create fires straight after the
  // identity step, before the identity hook has re-read the new row.
  async function createRoom(uid?: string, displayName?: string) {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "imposter",
          userId: uid ?? identity.userId ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
      savePlayer(data.code, data.playerId, displayName ?? name);
      router.push(`/room/${data.code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
      setSubmitting(false);
    }
  }

  // "Start a game" — named players go straight into a fresh room;
  // nameless players hit the identity step first, which then fires
  // createRoom itself.
  function startGame() {
    setError(null);
    if (hasName) {
      void createRoom();
    } else {
      setMode("create");
    }
  }

  async function joinRoom() {
    setError(null);
    setSubmitting(true);
    try {
      const code = joinCode.trim().toUpperCase();
      const res = await fetch(`/api/rooms/${code}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: identity.userId ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
      savePlayer(code, data.playerId, name);
      router.push(`/room/${code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
      setSubmitting(false);
    }
  }

  const canJoin =
    hasName && !submitting && joinCode.trim().length === 4;

  // Adaptive routing. `/` is one route with two faces. We can't pick
  // one until identity, groups, and the stats count have all
  // resolved — until then we show a bare wordmark splash so the wrong
  // page never flashes.
  //  - dataReady: identity bootstrapped AND both fetches landed.
  //  - returning: they belong to a group or have played a match.
  //  - new: dataReady and neither of those.
  const dataReady =
    identity.ready && groups !== null && totalMatches !== null;
  const isReturning =
    (groups?.length ?? 0) > 0 || (totalMatches ?? 0) > 0;
  // The create/join flow is in progress whenever mode leaves "choose".
  const inFlow = mode !== "choose";

  // Two faces, two routes: new / signed-out visitors live at `/`,
  // returning players at `/home`. The page renders the right face off
  // `isReturning` regardless of URL, so the user always sees the
  // correct content immediately — this just nudges the address to
  // match once the data has resolved.
  const pathname = usePathname();
  useEffect(() => {
    if (!dataReady || inFlow) return;
    if (isReturning && pathname !== "/home") {
      router.replace("/home");
    } else if (!isReturning && pathname === "/home") {
      router.replace("/");
    }
  }, [dataReady, isReturning, inFlow, pathname, router]);

  // True while we're on the wrong URL for who this player is and a
  // redirect is about to fire. Keep the splash up through it — never
  // flash the face we're seconds from navigating away from.
  const needsRedirect =
    dataReady &&
    !inFlow &&
    ((isReturning && pathname !== "/home") ||
      (!isReturning && pathname === "/home"));

  // Onboarding flow body. Nameless players see the identity step
  // first; named players who chose "join" go straight to the code
  // input. (Named + "create" never reaches here — startGame fires
  // createRoom directly, so there's no pre-flow at all.)
  const flowBlock = (
    <div className="w-full">
      {identity.ready && !hasName ? (
        <IdentityStep
          userId={identity.userId}
          onSaved={(savedName, uid) => {
            setLocalName(savedName);
            // Create: room is made immediately. Join: this re-render
            // now drops through to the code input below.
            if (mode === "create") {
              void createRoom(uid ?? undefined, savedName);
            }
          }}
          onCancel={() => {
            setMode("choose");
            setError(null);
          }}
        />
      ) : mode === "join" ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="space-y-6"
        >
          <label className="block space-y-2">
            <SectionLabel>Room code</SectionLabel>
            <input
              value={joinCode}
              onChange={(e) =>
                setJoinCode(e.target.value.toUpperCase().slice(0, 4))
              }
              type="text"
              name="room-code"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="characters"
              spellCheck={false}
              data-form-type="other"
              data-1p-ignore="true"
              data-lpignore="true"
              maxLength={4}
              placeholder="ABCD"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && canJoin) joinRoom();
              }}
              className="w-full rounded-xl border border-line bg-surface/40 px-4 py-3.5 text-center font-serif text-3xl tracking-[0.3em] text-ink outline-none transition placeholder:text-ink-faint focus:border-accent"
            />
          </label>

          <Button
            size="lg"
            onClick={joinRoom}
            disabled={!canJoin}
            className="w-full"
          >
            {submitting ? "Joining…" : "Join room"}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setMode("choose");
              setError(null);
            }}
            className="w-full"
          >
            ← Back
          </Button>

          {error && (
            <p className="rounded-lg border-l-4 border-oxblood bg-oxblood/10 px-4 py-2.5 text-sm font-normal text-oxblood">
              {error}
            </p>
          )}
        </motion.div>
      ) : null}
    </div>
  );

  return (
    <>
      {/* Ambient conic glow — the brand sweep, behind everything. */}
      <ConicBackdrop />

      {/* Persistent account control — pinned top-right, present on
          every home face once identity has resolved (FACE A and
          FACE B both, and the create/join flow). Shown for anyone who
          has an identity worth managing — a set name or a real
          account. A brand-new visitor with neither gets the plain
          "Sign in" entry on the landing instead, so the two never
          collide in the same corner. */}
      {dataReady && (hasName || signedIn) && (
        <div className="fixed right-4 top-4 z-50">
          <AccountMenu
            name={name}
            userId={identity.userId}
            avatar={identity.defaultAvatar}
            email={identity.email}
            discordUsername={identity.discordUsername}
            discordLinked={identity.discordLinked}
            onRenamed={(next) => setLocalName(next)}
          />
        </div>
      )}

      {/* Display-name prompt — only for signed-in players who never
          set a name. They have a real account worth completing, and a
          nameless player reads as "?" on rosters and in games. Shown
          once per load, outside the create/join flow. Anonymous
          visitors are left alone — they name themselves inline in the
          flow (IdentityStep), so a modal on arrival would just be
          friction. */}
      {dataReady && !needsRedirect && !inFlow && signedIn && !hasName &&
        !namePromptDismissed && (
          <DisplayNamePrompt
            userId={identity.userId}
            onSaved={(savedName) => {
              setLocalName(savedName);
              setNamePromptDismissed(true);
            }}
            onDismiss={() => setNamePromptDismissed(true)}
          />
        )}

      {/* FACE 0 — splash. Identity / groups / stats still settling.
          A bare centered wordmark + loader filling the viewport so
          neither real face flashes. */}
      {(!dataReady || needsRedirect) && !inFlow && (
        <main className="flex min-h-screen w-full flex-col items-center justify-center gap-8 px-6">
          <Wordmark className="text-7xl sm:text-8xl" />
          <UpperLoader size={72} />
        </main>
      )}

      {/* FACE A — new-visitor landing. The marketing front door:
          wordmark, loud hook, the five-game showcase, and the two
          CTAs into the shared create/join flow. Full-bleed: on lg+ a
          two-column split (pitch | showcase) using the whole width;
          below lg it stacks into a single centered column. */}
      {dataReady && !isReturning && !inFlow && !needsRedirect && (
        <main className="flex min-h-screen w-full flex-col items-center justify-center px-6 py-16 sm:py-20 lg:py-12">
          {/* Sign-in entry — only for a brand-new visitor: no name,
              no account. Anyone with either reaches their account
              through the persistent top-right AccountMenu instead, so
              the two never collide in the same corner. */}
          {!hasName && !signedIn && (
            <Link
              href="/auth"
              className={buttonClasses({
                variant: "secondary",
                size: "sm",
                className: "fixed right-5 top-5 z-50 backdrop-blur-sm",
              })}
            >
              Sign in
            </Link>
          )}
          <div className="flex w-full max-w-md flex-col items-stretch gap-12 sm:gap-14 lg:max-w-6xl lg:flex-row lg:items-center lg:gap-20 xl:max-w-7xl xl:gap-28">
          {/* LEFT — the pitch: wordmark, hook, supporting line,
              CTAs, and the how-to-play link. */}
          <div className="flex w-full flex-col items-stretch gap-10 lg:w-1/2 lg:gap-12">
          <motion.header
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="flex w-full flex-col items-start"
          >
            {/* The loud anchor — the wordmark in full brand colour. */}
            <Wordmark className="text-7xl sm:text-8xl" />
            {/* The hook — oversized, loud, lowercase. */}
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.08, ease: "easeOut" }}
              className="mt-5 text-[2.75rem] font-bold leading-[0.95] tracking-tight text-ink sm:text-6xl"
            >
              round up
              <br />
              the{" "}
              <span className="inline-block rounded-xl bg-accent px-2 pb-1 text-white">
                squad.
              </span>
            </motion.p>
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.16, ease: "easeOut" }}
              className="mt-5 text-xl font-medium lowercase leading-snug text-ink-soft sm:text-2xl"
            >
              five games, one room. pick a chaos.
            </motion.p>
            <Link
              href="/rules"
              className="mt-4 text-sm font-semibold lowercase text-accent transition hover:text-ink"
            >
              how to play →
            </Link>
          </motion.header>

          {/* CTAs into the shared flow. */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.6, ease: "easeOut" }}
            className="w-full space-y-3"
          >
            <Button
              size="xl"
              onClick={startGame}
              disabled={submitting}
              className="w-full lowercase"
            >
              {submitting ? "starting…" : "start a game →"}
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onClick={() => {
                setMode("join");
                setError(null);
              }}
              className="w-full lowercase"
            >
              got a code? join →
            </Button>
          </motion.div>
          </div>

          {/* RIGHT — the five games, shown off: a clean, aligned
              stack. A showcase, not a picker — the game is chosen in
              the lobby. */}
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.24, ease: "easeOut" }}
            className="w-full lg:w-1/2"
          >
            <h2 className="mb-4 text-sm font-bold lowercase tracking-tight text-ink-faint">
              the lineup ↓
            </h2>
            <div className="flex flex-col gap-3">
              {GAMES.map((g, i) => {
                const Vignette = GAME_VIGNETTES[g.kind];
                return (
                  <motion.div
                    key={g.kind}
                    initial={{ opacity: 0, y: 16, scale: 0.92 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{
                      type: "spring",
                      stiffness: 280,
                      damping: 20,
                      delay: 0.28 + i * 0.07,
                    }}
                    whileHover={{ y: -5, scale: 1.035 }}
                    className="flex w-full items-center gap-4 rounded-3xl px-5 py-4 shadow-lg"
                    style={{
                      background: cardGradient(
                        CARD_COLORS[i % CARD_COLORS.length]
                      ),
                    }}
                  >
                    {/* The game's animated vignette in a white badge,
                        on the card's bold brand colour. */}
                    {Vignette && (
                      <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white">
                        <Vignette />
                      </span>
                    )}
                    <span className="flex flex-col gap-0.5">
                      <span className="font-serif text-2xl text-white">
                        {g.title}
                      </span>
                      <span className="text-xs font-semibold lowercase text-white/80">
                        {g.sub}
                      </span>
                    </span>
                  </motion.div>
                );
              })}
            </div>
          </motion.section>
          </div>
        </main>
      )}

      {/* FACE B — returning-player home. A personal landing: a
          greeting, then what a returning player came back for — a
          live-squad banner, the start/join action, their squads, and
          a one-line stat glance. No marketing wordmark; this is their
          home, not the front door. */}
      {dataReady && isReturning && !inFlow && !needsRedirect && (
        <main className="mx-auto flex w-full max-w-md flex-col items-stretch gap-6 px-6 pb-16 pt-14 sm:gap-7 sm:pt-16 lg:max-w-xl lg:pt-20">
          {/* Greeting — the home's anchor in place of the wordmark.
              The persistent account menu floats top-right above it. */}
          <motion.header
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="space-y-4"
          >
            <h1 className="font-serif text-3xl text-ink sm:text-4xl">
              {name ? (
                <>
                  Hey <span className="text-accent">{name}</span>
                </>
              ) : (
                "Welcome back"
              )}
            </h1>
            <div className="h-px w-full bg-line" />
          </motion.header>

          {/* Live squad activity — the most urgent thing, when there
              is any. Renders nothing otherwise. */}
          {identity.userId && groups && (
            <LiveGroupActivityBanner
              groups={groups}
              userId={identity.userId}
            />
          )}

          {/* The play action — what they opened the app to do, so it
              sits high rather than buried below the squads list. */}
          <div className="w-full space-y-2.5">
            <Button
              size="lg"
              onClick={startGame}
              disabled={submitting}
              className="w-full"
            >
              {submitting ? "Starting…" : "Start a game"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setMode("join");
                setError(null);
              }}
              className="w-full"
            >
              or join with a code
            </Button>
          </div>

          {/* Squads — one-tap launch into a game with the regulars. */}
          {identity.userId && (
            <SquadsSection
              userId={identity.userId}
              email={identity.email}
              groups={groups}
              totalMatches={totalMatches}
            />
          )}

          {/* A one-line stat glance, then the rules link. */}
          {identity.userId && <HomeStatLine userId={identity.userId} />}
          <Link
            href="/rules"
            className="self-start text-sm font-medium text-accent transition hover:text-ink"
          >
            how to play →
          </Link>
        </main>
      )}

      {/* SHARED FLOW — create / join. Reached from either face. */}
      {inFlow && (
        <main className="mx-auto flex w-full max-w-md flex-col items-center gap-9 px-6 pb-16 pt-12 sm:gap-11 sm:pt-20 lg:max-w-xl lg:pt-24">
          <motion.header
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="flex flex-col items-center text-center"
          >
            <Wordmark className="text-6xl sm:text-7xl" />
          </motion.header>
          {flowBlock}
        </main>
      )}
    </>
  );
}

// The single identity moment in onboarding. Name yourself — or sign
// in, which fills the name for you and persists across devices. It's
// the same step finished two ways. Shown once, only while the player
// has no name; named players never see it again. The name lands on
// the `users` row (the one authored identity).
function IdentityStep({
  userId,
  onSaved,
  onCancel,
}: {
  userId: string | null;
  onSaved: (name: string, userId: string | null) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const next = value.trim();
    if (!next || saving) return;
    setError(null);
    setSaving(true);
    try {
      // PATCH when we already have a userId (explicit update); POST
      // otherwise (seeds default_nickname on a fresh user). Either
      // way the name lands on the `users` row.
      let res: Response;
      if (userId) {
        res = await fetch("/api/users/me", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, defaultNickname: next }),
        });
      } else {
        const deviceToken = getOrMintDeviceToken();
        res = await fetch("/api/users/me", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceToken, defaultNickname: next }),
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
      onSaved(
        (data.defaultNickname as string | null)?.trim() || next,
        (data.userId as string | null) ?? userId
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
      setSaving(false);
    }
  }

  // Sign in with Discord — fills the name from the Discord account and
  // persists the identity. Leaves the page for the OAuth round-trip.
  function continueWithDiscord() {
    const token = getOrMintDeviceToken();
    const qs = token ? `?deviceToken=${encodeURIComponent(token)}` : "";
    window.location.href = `/api/auth/discord/start${qs}`;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="space-y-5"
    >
      <label className="block space-y-2">
        <SectionLabel>What should we call you?</SectionLabel>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={20}
          placeholder="Alice"
          type="text"
          name="player-nickname"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="words"
          spellCheck={false}
          data-form-type="other"
          data-1p-ignore="true"
          data-lpignore="true"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
          }}
          className="w-full rounded-xl border border-line bg-surface/40 px-4 py-3.5 text-xl text-ink outline-none transition placeholder:text-ink-faint focus:border-accent"
        />
        <p className="text-xs text-ink-faint">
          This is your name everywhere — in every room and squad. You
          can change it any time.
        </p>
      </label>

      <Button
        size="lg"
        onClick={save}
        disabled={value.trim().length === 0 || saving}
        className="w-full"
      >
        {saving ? "Saving…" : "Continue →"}
      </Button>

      {/* Or sign in — the same step, finished a faster way. */}
      <div className="flex items-center gap-3" aria-hidden>
        <span className="h-px flex-1 bg-line" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
          or
        </span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <button
        type="button"
        onClick={continueWithDiscord}
        className="flex w-full items-center justify-center gap-2.5 rounded-2xl bg-[#5865F2] px-6 py-3.5 text-sm font-semibold text-white transition hover:brightness-110 active:scale-[0.98]"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden
        >
          <path d="M20.317 4.369A19.79 19.79 0 0 0 16.558 3c-.21.375-.444.88-.608 1.27a18.27 18.27 0 0 0-5.487 0A12.6 12.6 0 0 0 9.847 3 19.74 19.74 0 0 0 6.084 4.37C2.61 9.56 1.67 14.62 2.14 19.61a19.94 19.94 0 0 0 6.05 3.04c.49-.67.927-1.38 1.3-2.13-.713-.27-1.396-.602-2.04-.99.171-.127.34-.26.5-.396 3.927 1.83 8.18 1.83 12.06 0 .163.137.332.27.5.396-.645.39-1.33.722-2.043.992.375.75.81 1.46 1.3 2.13a19.9 19.9 0 0 0 6.053-3.04c.553-5.78-.945-10.79-3.96-15.24ZM8.68 16.54c-1.183 0-2.157-1.085-2.157-2.42 0-1.334.955-2.42 2.157-2.42 1.21 0 2.176 1.095 2.157 2.42 0 1.335-.955 2.42-2.157 2.42Zm6.64 0c-1.183 0-2.157-1.085-2.157-2.42 0-1.334.955-2.42 2.157-2.42 1.21 0 2.176 1.095 2.157 2.42 0 1.335-.946 2.42-2.157 2.42Z" />
        </svg>
        Continue with Discord
      </button>

      <p className="text-center text-xs text-ink-faint">
        Have an account?{" "}
        <Link
          href="/auth"
          className="font-medium text-accent transition hover:text-ink"
        >
          Sign in with email
        </Link>
      </p>

      <button
        onClick={onCancel}
        className="block w-full text-center text-sm font-medium text-ink-faint transition hover:text-ink"
      >
        ← Back
      </button>

      {error && (
        <p className="rounded-lg border-l-4 border-oxblood bg-oxblood/10 px-4 py-2.5 text-sm font-normal text-oxblood">
          {error}
        </p>
      )}
    </motion.div>
  );
}

// DisplayNamePrompt — a naming nudge for signed-in players who never
// set a `default_nickname`. They'd otherwise read as "?" on squad
// rosters and in games. Reuses the /api/users/me save path (PATCH, or
// POST for a yet-unsaved user) so the name lands on the `users` row
// and reflects everywhere via onSaved → setLocalName.
//
// A real modal (scrim + centred card), but dismissible — "later", the
// ×, the scrim, and Escape all defer it for this page load.
function DisplayNamePrompt({
  userId,
  onSaved,
  onDismiss,
}: {
  userId: string | null;
  onSaved: (name: string) => void;
  onDismiss: () => void;
}) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const next = value.trim();
    if (!next || saving) return;
    setError(null);
    setSaving(true);
    try {
      let res: Response;
      if (userId) {
        res = await fetch("/api/users/me", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, defaultNickname: next }),
        });
      } else {
        const deviceToken = getOrMintDeviceToken();
        res = await fetch("/api/users/me", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceToken, defaultNickname: next }),
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
      onSaved((data.defaultNickname as string | null)?.trim() || next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onOpenChange={(o) => {
        if (!o) onDismiss();
      }}
      title="What should we call you?"
      description="Your squad sees this name in every room and game. Without one you show up as a plain “?”."
    >
      <div className="space-y-4">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={20}
          placeholder="Alice"
          type="text"
          name="player-nickname"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="words"
          spellCheck={false}
          data-form-type="other"
          data-1p-ignore="true"
          data-lpignore="true"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
          }}
          className="w-full rounded-xl border border-line bg-surface/40 px-4 py-3 text-lg text-ink outline-none transition placeholder:text-ink-faint focus:border-accent"
        />

        <Button
          onClick={save}
          disabled={value.trim().length === 0 || saving}
          size="lg"
          className="w-full"
        >
          {saving ? "Saving…" : "Save"}
        </Button>

        <button
          type="button"
          onClick={onDismiss}
          className="block w-full text-center text-sm font-medium text-ink-faint transition hover:text-ink"
        >
          later
        </button>

        {error && (
          <p className="rounded-lg border-l-4 border-oxblood bg-oxblood/10 px-4 py-2.5 text-sm text-oxblood">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

// AccountMenu — the home page's single account affordance. The
// trigger is the player's avatar + name; tapping it opens a chunky
// dropdown panel that consolidates what used to be three scattered
// pieces: the "playing as" rename line, the linked-logins entry
// point, and (for signed-in players) Sign out.
//
// The panel closes on outside-click + Escape, matching the room's
// AvatarPicker pattern. All the underlying logic — the /api/users/me
// PATCH rename, the Discord/email link navigations, the signOut()
// helper — is unchanged; this is purely a reorganization into a menu.
function AccountMenu({
  name,
  userId,
  avatar,
  email,
  discordUsername,
  discordLinked,
  onRenamed,
}: {
  name: string;
  userId: string | null;
  avatar: string | null;
  email: string | null;
  discordUsername: string | null;
  discordLinked: boolean;
  onRenamed: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement | null>(null);
  // Account is "signed in" once a real provider is attached. Drives
  // the Sign out item — an anonymous device-only user has nothing to
  // sign out of.
  const signedIn = !!(email || discordLinked);

  // Close on outside click + Escape — the AvatarPicker pattern.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const av = avatarFor(userId ?? name, name, avatar);

  return (
    <div className="relative" ref={popRef}>
      {/* Trigger — a compact avatar chip. Pinned next to the theme
          controls, so it stays just the avatar (no full name + caret
          bar) to keep the cluster tight. Neutral chrome styling — a
          soft hairline ring, no brutalist slab. */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        title={name}
        className="flex items-center justify-center rounded-full border border-line bg-surface p-0.5 shadow-sm transition hover:border-ink-faint hover:shadow"
      >
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${av.color} ${
            av.isCustom ? "text-ink" : "text-white"
          }`}
        >
          {av.initial}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-11 z-50 w-72 space-y-3 rounded-xl border border-line bg-surface p-4 text-left shadow-lg"
        >
          {/* 1. Identity — avatar + name + rename. */}
          <AccountIdentity
            name={name}
            userId={userId}
            avatar={avatar}
            email={email}
            discordUsername={discordUsername}
            onRenamed={onRenamed}
          />

          <div className="border-t border-line" />

          {/* 2. Linked logins — attach a second provider. */}
          <AccountLinkedLogins
            email={email}
            discordLinked={discordLinked}
          />

          {/* 3. Sign out — only for accounts with a real provider. */}
          {signedIn && (
            <>
              <div className="border-t border-line" />
              <AccountSignOut email={email} discordLinked={discordLinked} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Identity row inside the menu — shows who you are and lets you
// rename. Editing writes the user's authored identity on `users`
// (via the /api/users/me PATCH — the explicit profile-change path),
// so it changes everywhere at once. Logic carried over verbatim from
// the old IdentityLine.
function AccountIdentity({
  name,
  userId,
  avatar,
  email,
  discordUsername,
  onRenamed,
}: {
  name: string;
  userId: string | null;
  avatar: string | null;
  email: string | null;
  discordUsername: string | null;
  onRenamed: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [saving, setSaving] = useState(false);
  const av = avatarFor(userId ?? name, name, avatar);

  async function save() {
    const next = value.trim();
    if (!next || next === name || !userId) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, defaultNickname: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error();
      onRenamed((data.defaultNickname as string | null)?.trim() || next);
      setEditing(false);
    } catch {
      /* leave the editor open so the user can retry */
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2.5">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base font-semibold ${av.color} ${
            av.isCustom ? "text-ink" : "text-white"
          }`}
        >
          {av.initial}
        </span>
        {editing ? (
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={20}
            autoFocus
            placeholder="Add your name"
            className="min-w-0 flex-1 border-b border-line bg-transparent text-sm text-ink outline-none transition placeholder:text-ink-faint focus:border-accent"
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") {
                e.stopPropagation();
                setValue(name);
                setEditing(false);
              }
            }}
          />
        ) : (
          <div className="min-w-0 flex-1">
            {/* A nameless user still gets a legible identity row — an
                italic "Set your name" stands in for the missing name
                so the row never reads as blank. */}
            {name.trim() ? (
              <p className="truncate text-sm font-semibold text-ink">{name}</p>
            ) : (
              <p className="truncate text-sm font-semibold italic text-ink-faint">
                Set your name
              </p>
            )}
            <p className="truncate text-[11px] text-ink-faint">
              {email
                ? email
                : discordUsername
                  ? `Discord · ${discordUsername}`
                  : "Device-only account"}
            </p>
          </div>
        )}
        {editing ? (
          <button
            onClick={save}
            disabled={saving}
            className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent disabled:opacity-40"
          >
            {saving ? "…" : "Save"}
          </button>
        ) : (
          <button
            onClick={() => {
              setValue(name);
              setEditing(true);
            }}
            className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent transition hover:text-ink"
          >
            {name.trim() ? "Edit" : "Add"}
          </button>
        )}
      </div>
    </div>
  );
}

// Linked-logins row inside the menu. Lets an already-signed-in player
// attach their second provider so either login resolves to the same
// account; the backend (Discord OAuth callback + magic-link verify)
// already does the attach/merge — this is purely the entry point.
//  - email only      → "Link Discord" (navigates to the OAuth start)
//  - discord only    → "Add email" (navigates to the magic-link page)
//  - both linked     → a quiet static "email + discord linked" line
//  - neither (anon)  → a "Save your account" CTA to claim the account
// Logic carried over verbatim from the old LinkedLogins, with the
// anonymous case now showing the claim CTA instead of nothing (the
// menu always renders, so it shouldn't be an empty section).
function AccountLinkedLogins({
  email,
  discordLinked,
}: {
  email: string | null;
  discordLinked: boolean;
}) {
  const hasEmail = !!email;

  if (hasEmail && discordLinked) {
    return (
      <p className="text-[11px] font-medium lowercase tracking-tight text-ink-faint">
        email + discord linked
      </p>
    );
  }

  if (hasEmail && !discordLinked) {
    return (
      <button
        type="button"
        onClick={() => {
          window.location.href = "/api/auth/discord/start";
        }}
        className="w-full rounded-full border border-line bg-surface/40 px-3 py-1.5 text-[11px] font-semibold lowercase tracking-tight text-ink-soft transition hover:border-ink hover:text-ink"
      >
        link discord
      </button>
    );
  }

  if (!hasEmail && discordLinked) {
    // discord only — offer email.
    return (
      <Link
        href="/auth"
        className="block w-full rounded-full border border-line bg-surface/40 px-3 py-1.5 text-center text-[11px] font-semibold lowercase tracking-tight text-ink-soft transition hover:border-ink hover:text-ink"
      >
        add email
      </Link>
    );
  }

  // Anonymous device-only — point at claiming the account.
  return (
    <Link
      href="/auth"
      className="block w-full rounded-full border border-line bg-surface/40 px-3 py-1.5 text-center text-[11px] font-semibold lowercase tracking-tight text-ink-soft transition hover:border-ink hover:text-ink"
    >
      save your account
    </Link>
  );
}

// Sign-out row inside the menu. Confirms first (the message reassures
// that the account + stats survive), then unbinds this device via the
// signOut() helper and hard-reloads to `/` so a fresh device-only
// identity bootstraps. The account itself — and its email / Discord
// link — is untouched and can be signed back into.
function AccountSignOut({
  email,
  discordLinked,
}: {
  email: string | null;
  discordLinked: boolean;
}) {
  const [signingOut, setSigningOut] = useState(false);
  const provider = email ? "email" : discordLinked ? "Discord" : "your provider";

  async function handleSignOut() {
    const ok = window.confirm(
      `Sign out? Your account and stats are safe — sign back in anytime with ${provider}.`
    );
    if (!ok) return;
    setSigningOut(true);
    await signOut();
    window.location.href = "/";
  }

  return (
    <button
      onClick={handleSignOut}
      disabled={signingOut}
      className="w-full rounded-xl border border-line px-3 py-2 text-sm font-semibold text-ink-faint transition hover:border-oxblood hover:text-oxblood disabled:opacity-50"
    >
      {signingOut ? "Signing out…" : "Sign out"}
    </button>
  );
}

// "Your squads" section — the user's friend groups, rendered as
// visual squad cards led by their people. Lets the user create a new
// squad or join via code. Renders only after identity is ready (we
// need a userId to query). Always shown thereafter, even with 0
// squads, so first-time users have a path in.
type ActiveRoom = {
  code: string;
  kind: string;
  state: string;
};

type GroupMemberPreview = {
  userId: string;
  nickname: string;
  avatar: string | null;
};

type GroupRow = {
  id: string;
  name: string;
  inviteCode: string;
  ownerUserId: string;
  memberCount: number;
  role: string;
  activeRoom: ActiveRoom | null;
  members: GroupMemberPreview[];
};

// Live group-activity banner — the top-of-page "a game is happening
// right now" callout. Shows the most-recently-updated active room
// among the user's groups. Lobby rooms get a one-tap Join (identity
// is server-derived, no nickname); in-progress rooms get a Watch
// link to the spectate view.
function LiveGroupActivityBanner({
  groups,
  userId,
}: {
  groups: GroupRow[];
  userId: string;
}) {
  const router = useRouter();
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The groups API returns each group's single most-recent active
  // room; the rooms themselves arrive newest-first per group. We
  // can't compare across groups by updated_at here (not exposed), so
  // we just take the first group that has one — good enough, and we
  // stack the rest below if there are several.
  const live = groups.filter((g) => g.activeRoom);
  if (live.length === 0) return null;

  async function joinRoom(code: string) {
    setError(null);
    setJoining(true);
    try {
      const res = await fetch(`/api/rooms/${code}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
      localStorage.setItem(`ci:${code}:playerId`, data.playerId);
      router.push(`/room/${code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
      setJoining(false);
    }
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="w-full space-y-2.5"
    >
      {live.map((g) => {
        const room = g.activeRoom!;
        const inLobby = room.state === "lobby";
        return (
          <div
            key={g.id}
            className="flex items-center justify-between gap-3 rounded-2xl border border-leaf bg-leaf/10 px-4 py-3.5"
          >
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-leaf">
                <span className="text-[10px]">🟢</span>
                {inLobby ? "Game starting" : "Game in progress"}
              </span>
              <span className="truncate text-base font-semibold text-ink">
                {g.name} has a game going
              </span>
            </span>
            {inLobby ? (
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => joinRoom(room.code)}
                disabled={joining}
                className="shrink-0 rounded-xl bg-leaf px-5 py-2.5 text-sm font-semibold tracking-tight text-white shadow-sm transition-all duration-100 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {joining ? "Joining…" : "Join"}
              </motion.button>
            ) : (
              <Link
                href={`/spectate/${room.code}`}
                className="shrink-0 rounded-xl border border-leaf px-5 py-2.5 text-sm font-semibold tracking-tight text-leaf transition-all duration-100 hover:bg-leaf hover:text-white"
              >
                Watch
              </Link>
            )}
          </div>
        );
      })}
      {error && (
        <p className="rounded-lg border-l-4 border-oxblood bg-oxblood/10 px-3 py-2 text-sm font-normal text-oxblood">
          {error}
        </p>
      )}
    </motion.section>
  );
}

// Avatar cluster — the visual hero of a SquadCard. A squad IS its
// people, so we lead with overlapping circular avatars. Shows up to 6
// faces then a "+N" chip for the rest. Uses the shared `avatarFor`
// helper (passing the preview list as the roster so colors are
// distinct within the cluster).
function AvatarCluster({
  members,
  memberCount,
}: {
  members: GroupMemberPreview[];
  memberCount: number;
}) {
  const SHOWN = 6;
  const roster = members.map((m) => ({ id: m.userId }));
  const shown = members.slice(0, SHOWN);
  // Remainder beyond what's drawn — counts members we have no preview
  // for too, so a big squad still reads as big.
  const extra = Math.max(0, memberCount - shown.length);
  return (
    <div className="flex items-center">
      <div className="flex items-center">
        {shown.map((m, i) => {
          const av = avatarFor(m.userId, m.nickname, m.avatar, roster);
          return (
            <span
              key={m.userId}
              title={m.nickname}
              style={{ zIndex: SHOWN - i }}
              className={`flex h-9 w-9 items-center justify-center rounded-full border border-surface text-sm font-semibold text-white ${
                i > 0 ? "-ml-2.5" : ""
              } ${av.color} ${av.isCustom ? "text-ink" : ""}`}
            >
              {av.initial}
            </span>
          );
        })}
      </div>
      {extra > 0 && (
        <span
          className={`flex h-9 items-center justify-center rounded-full border border-surface bg-ink px-2 text-xs font-semibold text-surface ${
            shown.length > 0 ? "-ml-2.5" : ""
          }`}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}

// SquadCard — one friend group, rendered as a visual card led by its
// people. A live squad (activeRoom present) gets a lit accent
// treatment + bright action; a quiet squad stays calm + neutral.
function SquadCard({
  group,
  starting,
  onStart,
  onJoinRoom,
}: {
  group: GroupRow;
  starting: boolean;
  onStart: () => void;
  onJoinRoom: (code: string) => void;
}) {
  const room = group.activeRoom;
  const live = !!room;
  const inLobby = room?.state === "lobby";

  // Activity line: live → game kind; quiet → member count.
  const activity = live ? (
    <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-accent">
      <span className="text-[9px] leading-none">●</span>
      live · {room!.kind}
    </span>
  ) : (
    <span className="text-xs font-normal text-ink-faint">
      {group.memberCount}{" "}
      {group.memberCount === 1 ? "member" : "members"}
    </span>
  );

  // Action: lobby room → Join; in-progress → Watch; no room → Start.
  let action: React.ReactNode;
  if (live && inLobby) {
    action = (
      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={() => onJoinRoom(room!.code)}
        className="w-full rounded-xl bg-accent px-5 py-3 text-sm font-semibold tracking-tight text-white shadow-sm transition-all duration-100 hover:brightness-110 active:scale-[0.98]"
      >
        Join the game →
      </motion.button>
    );
  } else if (live && !inLobby) {
    action = (
      <Link
        href={`/spectate/${room!.code}`}
        className="block w-full rounded-xl bg-accent px-5 py-3 text-center text-sm font-semibold tracking-tight text-white shadow-sm transition-all duration-100 hover:brightness-110 active:scale-[0.98]"
      >
        Watch →
      </Link>
    );
  } else {
    action = (
      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={onStart}
        disabled={starting}
        className="w-full rounded-xl bg-ink px-5 py-3 text-sm font-semibold tracking-tight text-surface shadow-sm transition-all duration-100 hover:brightness-125 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {starting ? "Starting…" : "Start a game →"}
      </motion.button>
    );
  }

  return (
    <li
      className={`rounded-2xl p-3.5 space-y-3 transition-colors ${
        live
          ? "border border-accent bg-accent/10"
          : "border border-line bg-surface/40"
      }`}
    >
      {/* Header — squad name in serif + activity line. Name links to
          the group detail page (the manage surface). */}
      <div className="flex items-start justify-between gap-3">
        <Link
          href={`/group/${group.id}`}
          className="flex min-w-0 items-baseline gap-2 transition hover:text-accent"
        >
          <span className="truncate font-serif text-xl text-ink">
            {group.name}
          </span>
          {group.role === "owner" && (
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">
              Owner
            </span>
          )}
        </Link>
        <span className="shrink-0 pt-1">{activity}</span>
      </div>

      {/* Avatar cluster — the visual hero. */}
      {group.members.length > 0 ? (
        <AvatarCluster
          members={group.members}
          memberCount={group.memberCount}
        />
      ) : (
        <p className="text-xs text-ink-faint">No members yet</p>
      )}

      {action}
    </li>
  );
}

function SquadsSection({
  userId,
  email,
  groups,
  totalMatches,
}: {
  userId: string;
  email: string | null;
  groups: GroupRow[] | null;
  totalMatches: number | null;
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Tracks which squad's "start a game" button is mid-flight.
  const [startingGroupId, setStartingGroupId] = useState<string | null>(
    null
  );

  // Create a fresh imposter room attributed to a group, then drop the
  // host straight into it. Identity is server-derived from userId —
  // no nickname needed.
  async function startGroupGame(groupId: string) {
    setError(null);
    setStartingGroupId(groupId);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "imposter", userId, groupId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
      localStorage.setItem(`ci:${data.code}:playerId`, data.playerId);
      router.push(`/room/${data.code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
      setStartingGroupId(null);
    }
  }

  // Join a squad's live lobby room. Identity is server-derived from
  // userId — no nickname needed.
  async function joinGroupRoom(code: string) {
    setError(null);
    try {
      const res = await fetch(`/api/rooms/${code}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
      localStorage.setItem(`ci:${code}:playerId`, data.playerId);
      router.push(`/room/${code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    }
  }

  async function create() {
    const name = createName.trim();
    if (!name) return;
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "create failed");
      router.push(`/group/${data.groupId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "create failed");
      setPending(false);
    }
  }

  async function join() {
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 6) {
      setError("invite code is 6 chars");
      return;
    }
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/groups/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "join failed");
      router.push(`/group/${data.groupId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "join failed");
      setPending(false);
    }
  }

  // Activity-driven order: live squads sort to the top.
  const sortedGroups = groups
    ? [...groups].sort(
        (a, b) => Number(!!b.activeRoom) - Number(!!a.activeRoom)
      )
    : null;

  return (
    <section className="w-full space-y-3">
      <SectionLabel>Your squads</SectionLabel>

      {sortedGroups === null ? (
        <p className="text-sm text-ink-faint">Loading…</p>
      ) : sortedGroups.length === 0 ? (
        // Post-match nudge: a user who's played a couple of games but
        // has no squad gets an active prompt to make one (keeping
        // score is the payoff). A brand-new user with 0 matches still
        // gets the quiet empty state — no pressure on first visit.
        totalMatches !== null && totalMatches >= 2 ? (
          <div className="rounded-2xl border border-accent bg-accent/10 p-5 space-y-3">
            <p className="text-base font-semibold text-ink">
              You&apos;ve played {totalMatches} games — make a squad to
              keep score with your crew.
            </p>
            {email ? (
              <button
                onClick={() => {
                  setCreateOpen(true);
                  setJoinOpen(false);
                  setError(null);
                }}
                className="w-full rounded-xl bg-accent px-5 py-3 text-sm font-semibold tracking-tight text-white shadow-sm transition-all duration-100 hover:brightness-110 active:scale-[0.98]"
              >
                Create a squad
              </button>
            ) : (
              <Link
                href="/auth"
                className="block w-full rounded-xl bg-accent px-5 py-3 text-center text-sm font-semibold tracking-tight text-white shadow-sm transition-all duration-100 hover:brightness-110"
              >
                Sign in to create a squad →
              </Link>
            )}
          </div>
        ) : (
          <p className="text-sm text-ink-soft">
            No squads yet. Create one to start tracking stats with your
            regulars, or join an existing squad with an invite code.
          </p>
        )
      ) : (
        <ul className="space-y-2.5">
          {sortedGroups.map((g) => (
            <SquadCard
              key={g.id}
              group={g}
              starting={startingGroupId === g.id}
              onStart={() => startGroupGame(g.id)}
              onJoinRoom={joinGroupRoom}
            />
          ))}
        </ul>
      )}

      {/* Inline create / join controls. Squads need an email
          (cross-device identity is the whole point), so the buttons
          gate on identity.email. Anonymous click → /auth with the
          intent stashed; verify-success returns home and the user
          re-clicks (the buttons are no longer gated). */}
      {!email ? (
        <div className="rounded-xl border border-accent/30 bg-accent/5 p-4 text-sm text-ink-soft">
          <p>
            Squads need an email so your stats follow you across
            devices.
          </p>
          <Link
            href="/auth"
            className="mt-3 inline-block rounded-lg bg-accent px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white transition hover:brightness-110"
          >
            Sign in to create or join →
          </Link>
        </div>
      ) : (
        <div className="flex gap-2.5">
          <button
            onClick={() => {
              setCreateOpen((o) => !o);
              setJoinOpen(false);
              setError(null);
            }}
            className="flex-1 rounded-xl border border-line px-3 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft transition hover:border-ink hover:text-ink"
          >
            {createOpen ? "Cancel" : "Create squad"}
          </button>
          <button
            onClick={() => {
              setJoinOpen((o) => !o);
              setCreateOpen(false);
              setError(null);
            }}
            className="flex-1 rounded-xl border border-line px-3 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft transition hover:border-ink hover:text-ink"
          >
            {joinOpen ? "Cancel" : "Join with code"}
          </button>
        </div>
      )}

      {createOpen && (
        <div className="flex gap-2.5">
          <input
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            maxLength={60}
            placeholder="Squad name"
            type="text"
            name="group-name"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="words"
            spellCheck={false}
            data-form-type="other"
            data-1p-ignore="true"
            data-lpignore="true"
            autoFocus
            className="min-w-0 flex-1 rounded-xl border border-line bg-surface/40 px-3 py-2.5 text-base text-ink outline-none transition placeholder:text-ink-faint focus:border-accent"
            onKeyDown={(e) => {
              if (e.key === "Enter" && createName.trim() && !pending) create();
            }}
          />
          <button
            onClick={create}
            disabled={pending || createName.trim().length === 0}
            className="rounded-xl bg-accent px-5 text-xs font-semibold uppercase tracking-[0.14em] text-white transition hover:brightness-110 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-30"
          >
            {pending ? "…" : "Create"}
          </button>
        </div>
      )}

      {joinOpen && (
        <div className="flex gap-2.5">
          <input
            value={joinCode}
            onChange={(e) =>
              setJoinCode(e.target.value.toUpperCase().slice(0, 6))
            }
            type="text"
            name="group-invite-code"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="characters"
            spellCheck={false}
            data-form-type="other"
            data-1p-ignore="true"
            data-lpignore="true"
            maxLength={6}
            placeholder="ABCDEF"
            autoFocus
            className="min-w-0 flex-1 rounded-xl border border-line bg-surface/40 px-3 py-2.5 text-center font-serif text-xl tracking-[0.3em] text-ink outline-none transition placeholder:text-ink-faint focus:border-accent"
            onKeyDown={(e) => {
              if (e.key === "Enter" && joinCode.trim().length === 6 && !pending)
                join();
            }}
          />
          <button
            onClick={join}
            disabled={pending || joinCode.trim().length !== 6}
            className="rounded-xl bg-accent px-5 text-xs font-semibold uppercase tracking-[0.14em] text-white transition hover:brightness-110 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-30"
          >
            {pending ? "…" : "Join"}
          </button>
        </div>
      )}

      {error && (
        <p className="rounded-lg border-l-4 border-oxblood bg-oxblood/10 px-3 py-2 text-sm font-normal text-oxblood">
          {error}
        </p>
      )}
    </section>
  );
}

// PersonalStats — the cross-game stats rollup for one user. Read by
// the bootstrap fetch (to decide returning-vs-new) and by the home's
// one-line stat glance, HomeStatLine.
type PersonalStats = {
  totalMatches: number;
  games: {
    imposter: {
      played: number;
      asImposter: { played: number; won: number };
      asCrewmate: { played: number; won: number };
      totalDelta: number;
    };
    wavelength: { played: number; won: number; totalDelta: number };
    justOne: { played: number; totalDelta: number };
  };
};

// HomeStatLine — one muted line of stats for the returning player's
// home. A glance, not a section: total games plus the single most
// characterful highlight. Fetches the cross-game rollup; renders
// nothing until there's a played game to show.
function HomeStatLine({ userId }: { userId: string }) {
  const [data, setData] = useState<PersonalStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/users/me/stats?userId=${userId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((d: PersonalStats | null) => {
        if (!cancelled && d) setData(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!data || data.totalMatches === 0) return null;

  const total = data.totalMatches;
  const parts = [`${total} ${total === 1 ? "game" : "games"}`];
  const impWon = data.games.imposter.asImposter.won;
  const wvWon = data.games.wavelength.won;
  if (impWon > 0) {
    parts.push(`${impWon} as imposter`);
  } else if (wvWon > 0) {
    parts.push(`${wvWon} wavelength ${wvWon === 1 ? "win" : "wins"}`);
  }

  return (
    <p className="text-xs font-medium text-ink-faint">
      {parts.join(" · ")}
    </p>
  );
}
