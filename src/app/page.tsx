"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "motion/react";
import { useTheme } from "@/lib/theme";
import { PalettePicker } from "@/components/PalettePicker";
import { useIdentity } from "@/lib/identity";

type Mode = "choose" | "create" | "join";

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
  const [nickname, setNickname] = useState("");
  const [joinCode, setJoinCode] = useState("");
  // Identity bootstrap: ensures the device has a userId in
  // localStorage, upserts the users row server-side, bumps presence.
  // userId is forwarded into create/join calls so the resulting
  // players row is bound to this device's user.
  const identity = useIdentity();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Game picker. Defaults to imposter so existing UX is unchanged for
  // anyone who lands on the page and just hits "Create".
  const [gameKind, setGameKind] = useState<
    "imposter" | "wavelength" | "just-one"
  >("imposter");

  function savePlayer(code: string, playerId: string, nickname: string) {
    localStorage.setItem(`ci:${code}:playerId`, playerId);
    localStorage.setItem(`ci:${code}:nickname`, nickname);
  }

  async function createRoom() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname: nickname.trim(),
          kind: gameKind,
          userId: identity.userId ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
      savePlayer(data.code, data.playerId, nickname.trim());
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
          nickname: nickname.trim(),
          userId: identity.userId ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
      savePlayer(code, data.playerId, nickname.trim());
      router.push(`/room/${code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
      setSubmitting(false);
    }
  }

  const canSubmit =
    nickname.trim().length > 0 &&
    !submitting &&
    (mode === "create" ||
      (mode === "join" && joinCode.trim().length === 4));

  return (
    <>
      {/* Theme / palette controls pinned to the viewport top-right. */}
      <div className="fixed right-4 top-4 z-50 flex items-center gap-1">
        <PalettePicker />
        <HomeThemeToggle />
      </div>
      <main className="mx-auto flex w-full max-w-md flex-col items-center gap-9 px-6 pb-16 pt-12 sm:gap-11 sm:pt-20 lg:max-w-xl lg:pt-28">
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
          <p className="mt-6 text-lg leading-snug text-ink-soft">
            Short, social games to play with friends — 3 to 8 players,
            5 to 20 minutes.
          </p>
          <Link
            href="/rules"
            className="mt-4 text-sm font-semibold text-accent underline decoration-2 underline-offset-4 transition hover:text-ink"
          >
            How to play →
          </Link>
        </motion.header>

        {identity.ready && identity.userId && (
          <PersonalStatsCard userId={identity.userId} />
        )}

        {identity.ready && identity.userId && (
          <MyGroupsSection
            userId={identity.userId}
            email={identity.email}
          />
        )}

        <div className="w-full">
          {mode === "choose" ? (
            <div className="space-y-3.5">
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => setMode("create")}
                className="w-full rounded-2xl bg-accent px-6 py-5 text-lg font-bold tracking-tight text-white shadow-sm transition-all duration-100 hover:brightness-110 hover:shadow-md"
              >
                Create a room
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => setMode("join")}
                className="w-full rounded-2xl border-2 border-ink bg-transparent px-6 py-5 text-lg font-bold tracking-tight text-ink transition-all duration-100 hover:bg-ink hover:text-page"
              >
                Join a room
              </motion.button>
            </div>
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
                    {(
                      [
                        {
                          kind: "imposter" as const,
                          title: "Imposter",
                          sub: "3–8 · social deduction",
                        },
                        {
                          kind: "wavelength" as const,
                          title: "Wavelength",
                          sub: "3–6 · spectrum guessing",
                        },
                        {
                          kind: "just-one" as const,
                          title: "Just One",
                          sub: "3–7 · cooperative clues",
                        },
                      ]
                    ).map((g) => {
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
              <label className="block space-y-2">
                <SectionLabel>Your name</SectionLabel>
                <input
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
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
                  className="w-full rounded-xl border-2 border-line bg-surface/40 px-4 py-3.5 text-xl text-ink outline-none transition placeholder:text-ink-faint focus:border-accent"
                />
              </label>

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
      </main>
    </>
  );
}

// "My groups" section — fetches the caller's groups, lets them
// create a new one or join via code. Renders only after identity
// is ready (we need a userId to query). Always shown thereafter,
// even with 0 groups, so first-time users have a path in.
type GroupRow = {
  id: string;
  name: string;
  inviteCode: string;
  ownerUserId: string;
  memberCount: number;
  role: string;
};

function MyGroupsSection({
  userId,
  email,
}: {
  userId: string;
  email: string | null;
}) {
  const router = useRouter();
  const [groups, setGroups] = useState<GroupRow[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch(`/api/groups?userId=${userId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "load failed");
      setGroups(data.groups as GroupRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "load failed");
    }
  }, [userId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

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
        <p className="text-sm text-ink-soft">
          No groups yet. Create one to start tracking stats with your
          regulars, or join an existing group with an invite code.
        </p>
      ) : (
        <ul className="space-y-2">
          {groups.map((g) => (
            <li key={g.id}>
              <Link
                href={`/group/${g.id}`}
                className="flex items-center justify-between gap-3 rounded-xl border-2 border-line bg-surface/40 px-4 py-3 transition hover:border-ink"
              >
                <span className="flex items-baseline gap-2">
                  <span className="text-base font-semibold text-ink">
                    {g.name}
                  </span>
                  {g.role === "owner" && (
                    <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-accent">
                      Owner
                    </span>
                  )}
                </span>
                <span className="text-xs font-semibold text-ink-faint">
                  {g.memberCount}{" "}
                  {g.memberCount === 1 ? "member" : "members"}
                </span>
              </Link>
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

function PersonalStatsCard({ userId }: { userId: string }) {
  const [data, setData] = useState<PersonalStats | null>(null);

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
      <div className="space-y-1.5 border-t-2 border-line-soft pt-3">
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
