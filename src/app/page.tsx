"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "motion/react";
import { useTheme } from "@/lib/theme";
import { PalettePicker } from "@/components/PalettePicker";
import { useIdentity, getOrMintDeviceToken } from "@/lib/identity";

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
          A bare centered wordmark so neither real face flashes. */}
      {!dataReady && !inFlow && (
        <main className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col items-center justify-center px-6">
          <h1 className="font-serif text-7xl italic leading-[0.95] tracking-tight text-ink sm:text-8xl">
            Upper
          </h1>
        </main>
      )}

      {/* FACE A — new-visitor landing. The marketing front door:
          wordmark, hook, the five-game showcase, and the two CTAs
          into the shared create/join flow. */}
      {dataReady && !isReturning && !inFlow && (
        <main className="mx-auto flex w-full max-w-md flex-col items-center gap-9 px-6 pb-16 pt-12 sm:gap-11 sm:pt-20 lg:max-w-xl lg:pt-24">
          <motion.header
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="flex flex-col items-center text-center"
          >
            <h1 className="font-serif text-7xl italic leading-[0.95] tracking-tight text-ink sm:text-8xl">
              Upper
            </h1>
            <span className="mt-4 inline-block rounded-full bg-accent px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-white">
              Party games for the group
            </span>
            <p className="mt-6 text-lg font-medium leading-snug text-ink-soft">
              Party games for your crew. Free, instant, no app.
            </p>
            <Link
              href="/rules"
              className="mt-4 text-sm font-semibold text-accent underline decoration-2 underline-offset-4 transition hover:text-ink"
            >
              How to play →
            </Link>
          </motion.header>

          {/* The five games, shown off — a showcase, not a picker. */}
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.08, ease: "easeOut" }}
            className="w-full space-y-3"
          >
            <SectionLabel>Five games to play tonight</SectionLabel>
            <div className="grid grid-cols-1 gap-2.5">
              {GAMES.map((g, i) => (
                <motion.div
                  key={g.kind}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.3,
                    delay: 0.12 + i * 0.05,
                    ease: "easeOut",
                  }}
                  className="flex items-center gap-3 rounded-xl border-2 border-line bg-surface/40 px-4 py-3.5"
                >
                  <span className="flex flex-col gap-0.5">
                    <span className="font-serif text-xl text-ink">
                      {g.title}
                    </span>
                    <span className="text-xs font-medium text-ink-faint">
                      {g.sub}
                    </span>
                  </span>
                </motion.div>
              ))}
            </div>
          </motion.section>

          {/* CTAs into the shared flow. */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.4, ease: "easeOut" }}
            className="w-full space-y-2.5"
          >
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => {
                setMode("create");
                setError(null);
              }}
              className="w-full rounded-2xl bg-accent px-6 py-5 text-lg font-bold tracking-tight text-white shadow-sm transition-all duration-100 hover:brightness-110 hover:shadow-md"
            >
              Start playing
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => {
                setMode("join");
                setError(null);
              }}
              className="w-full rounded-xl border-2 border-line px-6 py-3.5 text-sm font-bold tracking-tight text-ink-soft transition-all duration-100 hover:border-ink hover:text-ink"
            >
              Join with a code
            </motion.button>
          </motion.div>
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

          {/* Your groups — each a one-tap "Start a game" launcher. */}
          {identity.userId && (
            <MyGroupsSection
              userId={identity.userId}
              email={identity.email}
              groups={groups}
              totalMatches={totalMatches}
            />
          )}

          {/* New-game entry into the shared flow; join is secondary. */}
          <div className="w-full space-y-2.5">
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => {
                setMode("create");
                setError(null);
              }}
              className="w-full rounded-2xl bg-accent px-6 py-4 text-base font-bold tracking-tight text-white shadow-sm transition-all duration-100 hover:brightness-110 hover:shadow-md"
            >
              + New game
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

// "My groups" section — fetches the caller's groups, lets them
// create a new one or join via code. Renders only after identity
// is ready (we need a userId to query). Always shown thereafter,
// even with 0 groups, so first-time users have a path in.
type ActiveRoom = {
  code: string;
  kind: string;
  state: string;
};

type GroupRow = {
  id: string;
  name: string;
  inviteCode: string;
  ownerUserId: string;
  memberCount: number;
  role: string;
  activeRoom: ActiveRoom | null;
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

function MyGroupsSection({
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
  // Tracks which group's "start a game" button is mid-flight.
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

  return (
    <section className="w-full space-y-3">
      <SectionLabel>My groups</SectionLabel>

      {groups === null ? (
        <p className="text-sm text-ink-faint">Loading…</p>
      ) : groups.length === 0 ? (
        // Post-match nudge: a user who's played a couple of games but
        // has no group gets an active prompt to make one (keeping
        // score is the payoff). A brand-new user with 0 matches still
        // gets the quiet empty state — no pressure on first visit.
        totalMatches !== null && totalMatches >= 2 ? (
          <div className="rounded-2xl border-2 border-accent bg-accent/10 p-5 space-y-3">
            <p className="text-base font-bold text-ink">
              You&apos;ve played {totalMatches} games — make a group to
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
                Create a group
              </button>
            ) : (
              <Link
                href="/auth"
                className="block w-full rounded-xl bg-accent px-5 py-3 text-center text-sm font-bold tracking-tight text-white shadow-sm transition-all duration-100 hover:brightness-110"
              >
                Sign in to create a group →
              </Link>
            )}
          </div>
        ) : (
          <p className="text-sm text-ink-soft">
            No groups yet. Create one to start tracking stats with your
            regulars, or join an existing group with an invite code.
          </p>
        )
      ) : (
        <ul className="space-y-2.5">
          {groups.map((g) => (
            <li
              key={g.id}
              className="rounded-2xl border-2 border-line bg-surface/40 p-3.5 space-y-3"
            >
              <div className="flex items-center justify-between gap-3">
                <Link
                  href={`/group/${g.id}`}
                  className="flex min-w-0 items-baseline gap-2 transition hover:text-accent"
                >
                  <span className="truncate text-base font-semibold text-ink">
                    {g.name}
                  </span>
                  {g.role === "owner" && (
                    <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.14em] text-accent">
                      Owner
                    </span>
                  )}
                </Link>
                <Link
                  href={`/group/${g.id}`}
                  className="shrink-0 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-faint transition hover:text-ink"
                >
                  {g.memberCount}{" "}
                  {g.memberCount === 1 ? "member" : "members"} · Manage
                </Link>
              </div>
              {g.activeRoom && g.activeRoom.state === "lobby" ? (
                // A game is already gathering for this group — point
                // at it instead of starting a competing room.
                <Link
                  href={`/room/${g.activeRoom.code}`}
                  className="block w-full rounded-xl bg-leaf px-5 py-3 text-center text-sm font-bold tracking-tight text-white shadow-sm transition-all duration-100 hover:brightness-110 active:scale-[0.98]"
                >
                  🟢 Join {g.name}&apos;s game →
                </Link>
              ) : (
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={() => startGroupGame(g.id)}
                  disabled={startingGroupId !== null}
                  className="w-full rounded-xl bg-accent px-5 py-3 text-sm font-bold tracking-tight text-white shadow-sm transition-all duration-100 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {startingGroupId === g.id
                    ? "Starting…"
                    : `Start a game with ${g.name} →`}
                </motion.button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Inline create / join controls. Friend groups need an email
          (cross-device identity is the whole point), so the buttons
          gate on identity.email. Anonymous click → /auth with the
          intent stashed; verify-success returns home and the user
          re-clicks (the buttons are no longer gated). */}
      {!email ? (
        <div className="rounded-xl border-2 border-accent/30 bg-accent/5 p-4 text-sm text-ink-soft">
          <p>
            Friend groups need an email so your stats follow you
            across devices.
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
            {createOpen ? "Cancel" : "Create group"}
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
            placeholder="Group name"
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
