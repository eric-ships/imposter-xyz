"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "motion/react";
import { useTheme } from "@/lib/theme";
import { PalettePicker } from "@/components/PalettePicker";
import { useIdentity, getOrMintDeviceToken } from "@/lib/identity";
import { avatarFor } from "@/lib/avatar";
import { UpperLoader } from "@/components/UpperLoader";
import { GAME_VIGNETTES } from "@/components/GameVignettes";

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

function HomeThemeToggle() {
  const { theme, toggle } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted ? theme === "dark" : false;
  return (
    <button
      onClick={toggle}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-faint transition-all duration-100 hover:bg-cream hover:text-ink active:scale-90"
    >
      {isDark ? (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
        </svg>
      )}
    </button>
  );
}

// Section heading — bolder than the old hairline tracked label.
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-ink-faint">
      {children}
    </h2>
  );
}

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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Game picker. Defaults to imposter so existing UX is unchanged for
  // anyone who lands on the page and just hits "Create".
  const [gameKind, setGameKind] = useState<GameKind>("imposter");
  // Optional friend-group attribution, chosen at room-creation time
  // (null = casual). Beats hunting for the lobby attribution pill.
  const [createGroupId, setCreateGroupId] = useState<string | null>(null);

  // Shared across the live banner + groups section: the user's groups
  // (with live-room info) and their total-matches count. Lifted here
  // so the top-of-page activity banner and MyGroupsSection read the
  // same data without duplicate fetches.
  const [groups, setGroups] = useState<GroupRow[] | null>(null);
  const [totalMatches, setTotalMatches] = useState<number | null>(null);

  const refetchGroups = useCallback(async () => {
    if (!identity.userId) return;
    try {
      const res = await fetch(`/api/groups?userId=${identity.userId}`);
      const data = await res.json();
      if (res.ok) setGroups(data.groups as GroupRow[]);
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
        setTotalMatches((d as PersonalStats).totalMatches);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [identity.userId]);

  function savePlayer(code: string, playerId: string) {
    localStorage.setItem(`ci:${code}:playerId`, playerId);
    localStorage.setItem(`ci:${code}:nickname`, name);
  }

  async function createRoom() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: gameKind,
          userId: identity.userId ?? undefined,
          groupId: createGroupId ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
      savePlayer(data.code, data.playerId);
      router.push(`/room/${data.code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
      setSubmitting(false);
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
      savePlayer(code, data.playerId);
      router.push(`/room/${code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
      setSubmitting(false);
    }
  }

  const canSubmit =
    hasName &&
    !submitting &&
    (mode === "create" ||
      (mode === "join" && joinCode.trim().length === 4));

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

  // Shared flow block — NamePrompt (if nameless) then the game
  // picker / group selector / create-join buttons. Both faces drop
  // into this exact element; neither forks the logic.
  const flowBlock = (
    <div className="w-full">
      {identity.ready && !hasName ? (
        <NamePrompt
          userId={identity.userId}
          onSaved={(next) => setLocalName(next)}
          onCancel={() => {
            setMode("choose");
            setError(null);
          }}
        />
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="space-y-6"
        >
          {mode === "create" && (
            <div className="space-y-2.5">
              <SectionLabel>Pick a game</SectionLabel>
              <div className="grid grid-cols-1 gap-2.5">
                {GAMES.map((g) => {
                  const selected = gameKind === g.kind;
                  return (
                    <button
                      key={g.kind}
                      type="button"
                      onClick={() => setGameKind(g.kind)}
                      className={`flex items-center justify-between gap-3 rounded-xl border-2 px-4 py-3.5 text-left transition-all duration-100 active:scale-[0.98] ${
                        selected
                          ? "border-accent bg-accent/10"
                          : "border-line bg-surface/40 hover:border-ink"
                      }`}
                    >
                      <span className="flex flex-col gap-0.5">
                        <span className="font-serif text-xl text-ink">
                          {g.title}
                        </span>
                        <span className="text-xs font-medium text-ink-faint">
                          {g.sub}
                        </span>
                      </span>
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-bold ${
                          selected
                            ? "border-accent bg-accent text-white"
                            : "border-line text-transparent"
                        }`}
                      >
                        ✓
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {mode === "create" && groups && groups.length > 0 && (
            <div className="space-y-2.5">
              <SectionLabel>For a group?</SectionLabel>
              <div className="grid grid-cols-1 gap-2.5">
                {[
                  {
                    id: null as string | null,
                    title: "Just casual",
                    sub: "not tracked to a group",
                  },
                  ...groups.map((g) => ({
                    id: g.id as string | null,
                    title: g.name,
                    sub: "match counts toward this group",
                  })),
                ].map((opt) => {
                  const selected = createGroupId === opt.id;
                  return (
                    <button
                      key={opt.id ?? "casual"}
                      type="button"
                      onClick={() => setCreateGroupId(opt.id)}
                      className={`flex items-center justify-between gap-3 rounded-xl border-2 px-4 py-3.5 text-left transition-all duration-100 active:scale-[0.98] ${
                        selected
                          ? "border-accent bg-accent/10"
                          : "border-line bg-surface/40 hover:border-ink"
                      }`}
                    >
                      <span className="flex flex-col gap-0.5">
                        <span className="font-serif text-xl text-ink">
                          {opt.title}
                        </span>
                        <span className="text-xs font-medium text-ink-faint">
                          {opt.sub}
                        </span>
                      </span>
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-bold ${
                          selected
                            ? "border-accent bg-accent text-white"
                            : "border-line text-transparent"
                        }`}
                      >
                        ✓
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {mode === "join" && (
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
                className="w-full rounded-xl border-2 border-line bg-surface/40 px-4 py-3.5 text-center font-serif text-3xl tracking-[0.3em] text-ink outline-none transition placeholder:text-ink-faint focus:border-accent"
              />
            </label>
          )}

          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={mode === "create" ? createRoom : joinRoom}
            disabled={!canSubmit}
            className="w-full rounded-2xl bg-accent px-6 py-5 text-lg font-bold tracking-tight text-white shadow-sm transition-all duration-100 hover:brightness-110 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:brightness-100"
          >
            {submitting
              ? mode === "create"
                ? "Creating…"
                : "Joining…"
              : mode === "create"
                ? "Create room"
                : "Join room"}
          </motion.button>

          <button
            onClick={() => {
              setMode("choose");
              setError(null);
            }}
            className="block w-full text-center text-sm font-semibold text-ink-faint transition hover:text-ink"
          >
            ← Back
          </button>

          {error && (
            <p className="rounded-lg border-l-4 border-oxblood bg-oxblood/10 px-4 py-2.5 text-sm font-medium text-oxblood">
              {error}
            </p>
          )}
        </motion.div>
      )}
    </div>
  );

  return (
    <>
      {/* Theme / palette controls pinned to the viewport top-right. */}
      <div className="fixed right-4 top-4 z-50 flex items-center gap-1">
        <PalettePicker />
        <HomeThemeToggle />
      </div>

      {/* FACE 0 — splash. Identity / groups / stats still settling.
          A bare centered wordmark + loader filling the viewport so
          neither real face flashes. */}
      {!dataReady && !inFlow && (
        <main className="flex min-h-screen w-full flex-col items-center justify-center gap-8 px-6">
          <h1 className="font-serif text-7xl italic leading-[0.95] tracking-tight text-ink sm:text-8xl">
            Upper
          </h1>
          <UpperLoader size={48} />
        </main>
      )}

      {/* FACE A — new-visitor landing. The marketing front door:
          wordmark, loud hook, the five-game showcase, and the two
          CTAs into the shared create/join flow. Full-bleed: on lg+ a
          two-column split (pitch | showcase) using the whole width;
          below lg it stacks into a single centered column. */}
      {dataReady && !isReturning && !inFlow && (
        <main className="flex min-h-screen w-full flex-col items-center justify-center px-6 py-16 sm:py-20 lg:py-12">
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
            {/* Classic serif anchor — the one quiet element. */}
            <h1 className="font-serif text-7xl italic leading-[0.95] tracking-tight text-ink sm:text-8xl">
              Upper
            </h1>
            {/* The hook — oversized, loud, lowercase. */}
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.08, ease: "easeOut" }}
              className="mt-5 text-[2.75rem] font-extrabold leading-[0.95] tracking-tight text-ink sm:text-6xl"
            >
              round up
              <br />
              the{" "}
              <span className="-rotate-2 inline-block rounded-xl bg-accent px-2 pb-1 text-white">
                squad.
              </span>
            </motion.p>
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.16, ease: "easeOut" }}
              className="mt-5 text-lg font-semibold lowercase leading-snug text-ink-soft"
            >
              five games, one room. pick a chaos.
            </motion.p>
            <Link
              href="/rules"
              className="mt-4 text-sm font-bold lowercase text-accent underline decoration-2 underline-offset-4 transition hover:text-ink"
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
            <motion.button
              whileTap={{ scale: 0.97 }}
              whileHover={{ y: -2 }}
              onClick={() => {
                setMode("create");
                setError(null);
              }}
              className="w-full rounded-2xl border-2 border-ink bg-accent px-6 py-5 text-xl font-extrabold lowercase tracking-tight text-white shadow-[4px_4px_0_0_var(--color-ink)] transition-[filter] duration-100 hover:brightness-110"
            >
              let&apos;s go →
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => {
                setMode("join");
                setError(null);
              }}
              className="w-full rounded-2xl border-2 border-line px-6 py-3.5 text-sm font-bold lowercase tracking-tight text-ink-soft transition-all duration-100 hover:border-ink hover:text-ink"
            >
              got a code? hop in
            </motion.button>
          </motion.div>
          </div>

          {/* RIGHT — the five games, shown off: a showcase, not a
              picker. Looser than a tidy grid: cards alternate their
              lean so the stack reads kinetic, not corporate. */}
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.24, ease: "easeOut" }}
            className="w-full lg:w-1/2"
          >
            <h2 className="mb-4 text-sm font-extrabold lowercase tracking-tight text-ink-faint">
              the lineup ↓
            </h2>
            <div className="flex flex-col gap-3">
              {GAMES.map((g, i) => {
                const Vignette = GAME_VIGNETTES[g.kind];
                // Alternate lean + offset so the stack feels hand-set.
                const lean = i % 2 === 0 ? "-rotate-1" : "rotate-1";
                const nudge = i % 2 === 0 ? "self-start" : "self-end";
                return (
                  <motion.div
                    key={g.kind}
                    initial={{ opacity: 0, y: 10, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{
                      duration: 0.32,
                      delay: 0.3 + i * 0.06,
                      ease: "easeOut",
                    }}
                    whileHover={{ rotate: 0, scale: 1.02 }}
                    className={`flex w-[92%] items-center gap-4 rounded-2xl border-2 border-ink bg-surface px-4 py-3.5 shadow-[3px_3px_0_0_var(--color-ink)] ${lean} ${nudge}`}
                  >
                    {/* Animated game vignette — the card's visual. */}
                    {Vignette && (
                      <span className="flex h-14 w-14 shrink-0 items-center justify-center">
                        <Vignette />
                      </span>
                    )}
                    <span className="flex flex-col gap-0.5">
                      <span className="font-serif text-2xl text-ink">
                        {g.title}
                      </span>
                      <span className="text-xs font-semibold lowercase text-ink-faint">
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

      {/* FACE B — returning-player home. Live banner on top, then
          one-tap group launchers, the new-game entry, and small
          de-emphasized stats. */}
      {dataReady && isReturning && !inFlow && (
        <main className="mx-auto flex w-full max-w-md flex-col items-center gap-7 px-6 pb-16 pt-12 sm:gap-8 sm:pt-16 lg:max-w-xl lg:pt-20">
          <motion.header
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="flex flex-col items-center text-center"
          >
            <h1 className="font-serif text-6xl italic leading-[0.95] tracking-tight text-ink sm:text-7xl">
              Upper
            </h1>
            {identity.ready && hasName && (
              <div className="mt-3">
                <IdentityLine
                  name={name}
                  userId={identity.userId}
                  onRenamed={(next) => setLocalName(next)}
                />
              </div>
            )}
          </motion.header>

          {/* Live group-activity banner — highest priority. Only
              renders when a group has a live room. */}
          {identity.userId && groups && (
            <LiveGroupActivityBanner
              groups={groups}
              userId={identity.userId}
            />
          )}

          {/* Squads section + the new-game action, ordered by squad
              count. With squads: the cards lead, "+ New game" is the
              secondary option. With none: flip it — lead with a clear
              "Start a game" hero and let the make-a-squad nudge sit
              below. A low-squad home should be about playing, not an
              empty section. */}
          {(() => {
            const hasSquads = (groups?.length ?? 0) > 0;
            const squadsBlock = identity.userId ? (
              <SquadsSection
                key="squads"
                userId={identity.userId}
                email={identity.email}
                groups={groups}
                totalMatches={totalMatches}
              />
            ) : null;
            const playBlock = (
              <div key="play" className="w-full space-y-2.5">
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => {
                    setMode("create");
                    setError(null);
                  }}
                  className="w-full rounded-2xl bg-accent px-6 py-4 text-base font-bold tracking-tight text-white shadow-sm transition-all duration-100 hover:brightness-110 hover:shadow-md"
                >
                  {hasSquads ? "+ New game" : "Start a game"}
                </motion.button>
                <button
                  onClick={() => {
                    setMode("join");
                    setError(null);
                  }}
                  className="block w-full text-center text-sm font-semibold text-ink-faint transition hover:text-ink"
                >
                  Join a room with a code
                </button>
              </div>
            );
            return hasSquads ? (
              <>
                {squadsBlock}
                {playBlock}
              </>
            ) : (
              <>
                {playBlock}
                {squadsBlock}
              </>
            );
          })()}

          {/* Stats tucked small — a glance, not the hero. */}
          {identity.userId && (
            <PersonalStatsCard userId={identity.userId} compact />
          )}

          <Link
            href="/rules"
            className="text-sm font-semibold text-accent underline decoration-2 underline-offset-4 transition hover:text-ink"
          >
            How to play →
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
            <h1 className="font-serif text-6xl italic leading-[0.95] tracking-tight text-ink sm:text-7xl">
              Upper
            </h1>
          </motion.header>
          {flowBlock}
        </main>
      )}
    </>
  );
}

// One-identity: the single "what should we call you?" prompt. Shown
// once, the first time a nameless user tries to create or join. On
// submit it POSTs the name to /api/users/me so it lands on the
// `users` row — the one authored identity — then the caller proceeds
// into the chosen create/join flow.
function NamePrompt({
  userId,
  onSaved,
  onCancel,
}: {
  userId: string | null;
  onSaved: (name: string) => void;
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
      // If we already have a userId, PATCH is the explicit-update path
      // (POST only seeds default_nickname when it's currently null —
      // a fresh user with a never-set name). Either lands the name on
      // the `users` row, the one authored identity.
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
          className="w-full rounded-xl border-2 border-line bg-surface/40 px-4 py-3.5 text-xl text-ink outline-none transition placeholder:text-ink-faint focus:border-accent"
        />
        <p className="text-xs text-ink-faint">
          This is your name everywhere — in every room and group. You
          can change it any time.
        </p>
      </label>

      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={save}
        disabled={value.trim().length === 0 || saving}
        className="w-full rounded-2xl bg-accent px-6 py-5 text-lg font-bold tracking-tight text-white shadow-sm transition-all duration-100 hover:brightness-110 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:brightness-100"
      >
        {saving ? "Saving…" : "Continue"}
      </motion.button>

      <button
        onClick={onCancel}
        className="block w-full text-center text-sm font-semibold text-ink-faint transition hover:text-ink"
      >
        ← Back
      </button>

      {error && (
        <p className="rounded-lg border-l-4 border-oxblood bg-oxblood/10 px-4 py-2.5 text-sm font-medium text-oxblood">
          {error}
        </p>
      )}
    </motion.div>
  );
}

// Low-key "you're playing as <name>" line with an inline edit
// affordance. Editing here updates the user's authored identity on
// `users` (via the /api/users/me PATCH — the explicit profile-change
// path), so it changes everywhere at once.
function IdentityLine({
  name,
  userId,
  onRenamed,
}: {
  name: string;
  userId: string | null;
  onRenamed: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [saving, setSaving] = useState(false);

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

  if (editing) {
    return (
      <div className="flex items-center gap-2 text-sm text-ink-soft">
        <span>Playing as</span>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={20}
          autoFocus
          className="w-32 border-b border-line bg-transparent text-sm text-ink outline-none transition placeholder:text-ink-faint focus:border-accent"
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") {
              setValue(name);
              setEditing(false);
            }
          }}
        />
        <button
          onClick={save}
          disabled={saving}
          className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent disabled:opacity-40"
        >
          {saving ? "…" : "Save"}
        </button>
      </div>
    );
  }

  return (
    <p className="text-sm text-ink-faint">
      Playing as{" "}
      <span className="font-semibold text-ink-soft">{name}</span>
      {" · "}
      <button
        onClick={() => {
          setValue(name);
          setEditing(true);
        }}
        className="font-semibold text-accent transition hover:text-ink"
      >
        edit
      </button>
    </p>
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
            className="flex items-center justify-between gap-3 rounded-2xl border-2 border-leaf bg-leaf/10 px-4 py-3.5"
          >
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-leaf">
                <span className="text-[10px]">🟢</span>
                {inLobby ? "Game starting" : "Game in progress"}
              </span>
              <span className="truncate text-base font-bold text-ink">
                {g.name} has a game going
              </span>
            </span>
            {inLobby ? (
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => joinRoom(room.code)}
                disabled={joining}
                className="shrink-0 rounded-xl bg-leaf px-5 py-2.5 text-sm font-bold tracking-tight text-white shadow-sm transition-all duration-100 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {joining ? "Joining…" : "Join"}
              </motion.button>
            ) : (
              <Link
                href={`/spectate/${room.code}`}
                className="shrink-0 rounded-xl border-2 border-leaf px-5 py-2.5 text-sm font-bold tracking-tight text-leaf transition-all duration-100 hover:bg-leaf hover:text-white"
              >
                Watch
              </Link>
            )}
          </div>
        );
      })}
      {error && (
        <p className="rounded-lg border-l-4 border-oxblood bg-oxblood/10 px-3 py-2 text-sm font-medium text-oxblood">
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
              className={`flex h-9 w-9 items-center justify-center rounded-full border-2 border-surface text-sm font-bold text-white ${
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
          className={`flex h-9 items-center justify-center rounded-full border-2 border-surface bg-ink px-2 text-xs font-bold text-surface ${
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
    <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.12em] text-accent">
      <span className="text-[9px] leading-none">●</span>
      live · {room!.kind}
    </span>
  ) : (
    <span className="text-xs font-medium text-ink-faint">
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
        className="w-full rounded-xl bg-accent px-5 py-3 text-sm font-bold tracking-tight text-white shadow-sm transition-all duration-100 hover:brightness-110 active:scale-[0.98]"
      >
        Join the game →
      </motion.button>
    );
  } else if (live && !inLobby) {
    action = (
      <Link
        href={`/spectate/${room!.code}`}
        className="block w-full rounded-xl bg-accent px-5 py-3 text-center text-sm font-bold tracking-tight text-white shadow-sm transition-all duration-100 hover:brightness-110 active:scale-[0.98]"
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
        className="w-full rounded-xl bg-ink px-5 py-3 text-sm font-bold tracking-tight text-surface shadow-sm transition-all duration-100 hover:brightness-125 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {starting ? "Starting…" : "Start a game →"}
      </motion.button>
    );
  }

  return (
    <li
      className={`rounded-2xl p-3.5 space-y-3 transition-colors ${
        live
          ? "border-2 border-accent bg-accent/10"
          : "border-2 border-line bg-surface/40"
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
            <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.14em] text-accent">
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
          <div className="rounded-2xl border-2 border-accent bg-accent/10 p-5 space-y-3">
            <p className="text-base font-bold text-ink">
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
                className="w-full rounded-xl bg-accent px-5 py-3 text-sm font-bold tracking-tight text-white shadow-sm transition-all duration-100 hover:brightness-110 active:scale-[0.98]"
              >
                Create a squad
              </button>
            ) : (
              <Link
                href="/auth"
                className="block w-full rounded-xl bg-accent px-5 py-3 text-center text-sm font-bold tracking-tight text-white shadow-sm transition-all duration-100 hover:brightness-110"
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
        <div className="rounded-xl border-2 border-accent/30 bg-accent/5 p-4 text-sm text-ink-soft">
          <p>
            Squads need an email so your stats follow you across
            devices.
          </p>
          <Link
            href="/auth"
            className="mt-3 inline-block rounded-lg bg-accent px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-white transition hover:brightness-110"
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
            className="flex-1 rounded-xl border-2 border-line px-3 py-2.5 text-xs font-bold uppercase tracking-[0.12em] text-ink-soft transition hover:border-ink hover:text-ink"
          >
            {createOpen ? "Cancel" : "Create squad"}
          </button>
          <button
            onClick={() => {
              setJoinOpen((o) => !o);
              setCreateOpen(false);
              setError(null);
            }}
            className="flex-1 rounded-xl border-2 border-line px-3 py-2.5 text-xs font-bold uppercase tracking-[0.12em] text-ink-soft transition hover:border-ink hover:text-ink"
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
            className="min-w-0 flex-1 rounded-xl border-2 border-line bg-surface/40 px-3 py-2.5 text-base text-ink outline-none transition placeholder:text-ink-faint focus:border-accent"
            onKeyDown={(e) => {
              if (e.key === "Enter" && createName.trim() && !pending) create();
            }}
          />
          <button
            onClick={create}
            disabled={pending || createName.trim().length === 0}
            className="rounded-xl bg-accent px-5 text-xs font-bold uppercase tracking-[0.14em] text-white transition hover:brightness-110 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-30"
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
            className="min-w-0 flex-1 rounded-xl border-2 border-line bg-surface/40 px-3 py-2.5 text-center font-serif text-xl tracking-[0.3em] text-ink outline-none transition placeholder:text-ink-faint focus:border-accent"
            onKeyDown={(e) => {
              if (e.key === "Enter" && joinCode.trim().length === 6 && !pending)
                join();
            }}
          />
          <button
            onClick={join}
            disabled={pending || joinCode.trim().length !== 6}
            className="rounded-xl bg-accent px-5 text-xs font-bold uppercase tracking-[0.14em] text-white transition hover:brightness-110 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-30"
          >
            {pending ? "…" : "Join"}
          </button>
        </div>
      )}

      {error && (
        <p className="rounded-lg border-l-4 border-oxblood bg-oxblood/10 px-3 py-2 text-sm font-medium text-oxblood">
          {error}
        </p>
      )}
    </section>
  );
}

// Personal stats card — cross-group rollup, private to viewer.
// Hidden when the user has 0 matches played (no sad empty state on
// first visit). Compact card layout: total matches headline + per-game
// summary lines for whichever games they've actually played.
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

function PersonalStatsCard({
  userId,
  compact = false,
}: {
  userId: string;
  // Returning-player home wants stats as a glance, not a hero — the
  // compact variant is smaller, de-emphasized, and folds the per-game
  // detail behind a tap so the headline number is all that shows.
  compact?: boolean;
}) {
  const [data, setData] = useState<PersonalStats | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/users/me/stats?userId=${userId}`)
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as PersonalStats;
      })
      .then((d) => {
        if (cancelled || !d) return;
        setData(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!data || data.totalMatches === 0) return null;

  const g = data.games;
  const detailRows = (
    <div className="space-y-1.5">
      {g.imposter.played > 0 && (
        <PersonalRow
          label="Imposter"
          detail={`${g.imposter.played} played${
            g.imposter.asImposter.played > 0
              ? ` · imp ${g.imposter.asImposter.won}/${g.imposter.asImposter.played}`
              : ""
          }${
            g.imposter.asCrewmate.played > 0
              ? ` · crew ${g.imposter.asCrewmate.won}/${g.imposter.asCrewmate.played}`
              : ""
          }`}
        />
      )}
      {g.wavelength.played > 0 && (
        <PersonalRow
          label="Wavelength"
          detail={`${g.wavelength.played} played · won ${g.wavelength.won}${
            g.wavelength.played > 0
              ? ` · avg ${Math.round(
                  g.wavelength.totalDelta / g.wavelength.played
                )} pts`
              : ""
          }`}
        />
      )}
      {g.justOne.played > 0 && (
        <PersonalRow
          label="Just One"
          detail={`${g.justOne.played} played · avg ${(
            g.justOne.totalDelta / g.justOne.played
          ).toFixed(1)} per match`}
        />
      )}
    </div>
  );

  // Compact — a small, low-emphasis line. The headline count sits on
  // one row; tapping it reveals the same per-game detail.
  if (compact) {
    return (
      <section className="w-full">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex w-full items-baseline justify-between gap-2 rounded-xl border-2 border-line-soft bg-surface/30 px-4 py-2.5 text-left transition-all duration-100 hover:border-line active:scale-[0.99]"
        >
          <span className="text-xs font-bold uppercase tracking-[0.14em] text-ink-faint">
            Your stats
          </span>
          <span className="flex items-baseline gap-1.5">
            <span className="font-serif text-lg text-ink-soft">
              {data.totalMatches}
            </span>
            <span className="text-[11px] font-medium text-ink-faint">
              {data.totalMatches === 1 ? "match" : "matches"} ·{" "}
              {expanded ? "hide" : "details"}
            </span>
          </span>
        </button>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="mt-2 rounded-xl border-2 border-line-soft bg-surface/30 px-4 py-3"
          >
            {detailRows}
          </motion.div>
        )}
      </section>
    );
  }

  return (
    <section className="w-full space-y-3 rounded-2xl border-2 border-line bg-surface/50 p-5">
      <div className="flex items-baseline justify-between gap-2">
        <SectionLabel>Your stats</SectionLabel>
        <span className="text-[11px] font-medium text-ink-faint">
          across all groups
        </span>
      </div>
      <div className="font-serif text-4xl text-ink">
        {data.totalMatches}{" "}
        <span className="text-base font-sans font-medium text-ink-faint">
          {data.totalMatches === 1 ? "match" : "matches"} played
        </span>
      </div>
      <div className="border-t-2 border-line-soft pt-3">{detailRows}</div>

      {/* CTA used to live here, but the email gate now sits at the
           group-create moment (see MyGroupsSection) — the natural
           friction point for users who care about persistent stats.
           Anonymous users can still play forever and accumulate
           personal stats locally; they're only nudged to sign in
           when they try to opt into a friend group. */}
    </section>
  );
}

function PersonalRow({
  label,
  detail,
}: {
  label: string;
  detail: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="font-semibold text-ink">{label}</span>
      <span className="text-ink-soft">{detail}</span>
    </div>
  );
}
