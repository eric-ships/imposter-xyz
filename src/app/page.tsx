"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTheme } from "@/lib/theme";
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
      className="flex h-8 w-8 items-center justify-center text-ink-faint transition-all duration-100 hover:text-ink active:scale-90"
    >
      {isDark ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
        </svg>
      )}
    </button>
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
      {/* Theme toggle pinned to viewport top-right (was absolute inside
          main, which on a centered narrow column put it in the middle
          of the screen on widescreens). */}
      <div className="fixed right-4 top-4 z-50">
        <HomeThemeToggle />
      </div>
      <main className="mx-auto flex w-full max-w-md flex-col items-center gap-8 px-6 pb-12 pt-10 sm:gap-10 sm:pt-16 lg:max-w-xl lg:gap-12 lg:pt-24">
      <header className="text-center">
        <h1 className="font-serif text-6xl font-light italic tracking-tight text-ink">
          Upper
        </h1>
        <div className="mt-3 text-xs uppercase tracking-[0.22em] text-ink-faint">
          Party games for the group
        </div>
        <p className="mt-6 text-base leading-relaxed text-ink-soft">
          Short, social games to play with friends.
          <br />
          Three to eight players. Five to twenty minutes.
        </p>
        <Link
          href="/rules"
          className="mt-5 inline-block border-b border-ink-faint pb-0.5 text-xs text-ink-soft transition hover:border-ink hover:text-ink"
        >
          How to play
        </Link>
      </header>

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
          <div className="space-y-3">
            <button
              onClick={() => setMode("create")}
              className="w-full rounded-sm bg-ink px-6 py-4 text-sm font-medium tracking-wide text-page transition-all duration-100 hover:bg-accent active:scale-[0.97]"
            >
              Create a room
            </button>
            <button
              onClick={() => setMode("join")}
              className="w-full rounded-sm border border-ink px-6 py-4 text-sm font-medium tracking-wide text-ink transition-all duration-100 hover:bg-ink hover:text-page active:scale-[0.97]"
            >
              Join a room
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {mode === "create" && (
              <div>
                <span className="mb-2 block text-sm text-ink-soft">
                  Pick a game
                </span>
                <div className="grid grid-cols-1 gap-2">
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
                        className={`flex flex-col items-start gap-1 rounded-sm border px-3 py-3 text-left transition-all duration-100 active:scale-[0.98] ${
                          selected
                            ? "border-accent bg-accent/10"
                            : "border-line text-ink-soft hover:border-ink hover:text-ink"
                        }`}
                      >
                        <span
                          className={`font-serif text-base ${
                            selected ? "text-ink" : ""
                          }`}
                        >
                          {g.title}
                        </span>
                        <span className="text-[11px] uppercase tracking-[0.18em] text-ink-faint">
                          {g.sub}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <label className="block">
              <span className="mb-2 block text-sm text-ink-soft">
                Your name
              </span>
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
                className="w-full border-b border-line bg-transparent px-1 pb-2 text-xl text-ink outline-none transition placeholder:text-ink-faint focus:border-accent"
              />
            </label>

            {mode === "join" && (
              <label className="block">
                <span className="mb-2 block text-sm text-ink-soft">
                  Room code
                </span>
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
                  className="w-full border-b border-line bg-transparent px-1 pb-2 text-center font-serif text-2xl tracking-[0.3em] text-ink outline-none transition placeholder:text-ink-faint focus:border-accent"
                />
              </label>
            )}

            <button
              onClick={mode === "create" ? createRoom : joinRoom}
              disabled={!canSubmit}
              className="w-full rounded-sm bg-ink px-6 py-4 text-sm font-medium tracking-wide text-page transition-all duration-100 hover:bg-accent active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-30"
            >
              {submitting
                ? mode === "create"
                  ? "Creating…"
                  : "Joining…"
                : mode === "create"
                  ? "Create room"
                  : "Join room"}
            </button>

            <button
              onClick={() => {
                setMode("choose");
                setError(null);
              }}
              className="block w-full text-center text-xs text-ink-faint transition hover:text-ink"
            >
              ← Back
            </button>

            {error && (
              <p className="border-l-2 border-oxblood bg-oxblood/5 px-4 py-2 text-sm text-oxblood">
                {error}
              </p>
            )}
          </div>
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
      <h2 className="text-[11px] uppercase tracking-[0.22em] text-ink-faint">
        My groups
      </h2>

      {groups === null ? (
        <p className="text-xs text-ink-faint">Loading…</p>
      ) : groups.length === 0 ? (
        <p className="text-sm text-ink-soft">
          No groups yet. Create one to start tracking stats with your
          regulars, or join an existing group with an invite code.
        </p>
      ) : (
        <ul className="divide-y divide-line-soft border-y border-line-soft">
          {groups.map((g) => (
            <li key={g.id}>
              <Link
                href={`/group/${g.id}`}
                className="flex items-center justify-between gap-3 py-3 transition hover:bg-surface/40"
              >
                <span className="flex items-baseline gap-2">
                  <span className="text-sm text-ink">{g.name}</span>
                  {g.role === "owner" && (
                    <span className="text-[10px] uppercase tracking-[0.18em] text-accent">
                      Owner
                    </span>
                  )}
                </span>
                <span className="text-[11px] uppercase tracking-[0.18em] text-ink-faint">
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
        <div className="rounded-sm border border-accent/30 bg-accent/5 p-3 text-xs text-ink-soft">
          <p>
            Friend groups need an email so your stats follow you
            across devices.
          </p>
          <Link
            href="/auth"
            className="mt-2 inline-block rounded-sm border border-ink px-4 py-2 text-[11px] uppercase tracking-[0.2em] text-ink transition hover:bg-ink hover:text-page"
          >
            Sign in to create or join →
          </Link>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={() => {
              setCreateOpen((o) => !o);
              setJoinOpen(false);
              setError(null);
            }}
            className="flex-1 rounded-sm border border-line px-3 py-2 text-[11px] uppercase tracking-[0.2em] text-ink-soft transition hover:border-ink hover:text-ink"
          >
            {createOpen ? "Cancel" : "Create group"}
          </button>
          <button
            onClick={() => {
              setJoinOpen((o) => !o);
              setCreateOpen(false);
              setError(null);
            }}
            className="flex-1 rounded-sm border border-line px-3 py-2 text-[11px] uppercase tracking-[0.2em] text-ink-soft transition hover:border-ink hover:text-ink"
          >
            {joinOpen ? "Cancel" : "Join with code"}
          </button>
        </div>
      )}

      {createOpen && (
        <div className="flex gap-2">
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
            className="min-w-0 flex-1 border-b border-line bg-transparent px-1 pb-2 text-base text-ink outline-none transition placeholder:text-ink-faint focus:border-accent"
            onKeyDown={(e) => {
              if (e.key === "Enter" && createName.trim() && !pending) create();
            }}
          />
          <button
            onClick={create}
            disabled={pending || createName.trim().length === 0}
            className="rounded-sm bg-ink px-4 text-[11px] uppercase tracking-[0.2em] text-page transition hover:bg-accent active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-30"
          >
            {pending ? "…" : "Create"}
          </button>
        </div>
      )}

      {joinOpen && (
        <div className="flex gap-2">
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
            className="min-w-0 flex-1 border-b border-line bg-transparent px-1 pb-2 text-center font-serif text-xl tracking-[0.3em] text-ink outline-none transition placeholder:text-ink-faint focus:border-accent"
            onKeyDown={(e) => {
              if (e.key === "Enter" && joinCode.trim().length === 6 && !pending)
                join();
            }}
          />
          <button
            onClick={join}
            disabled={pending || joinCode.trim().length !== 6}
            className="rounded-sm bg-ink px-4 text-[11px] uppercase tracking-[0.2em] text-page transition hover:bg-accent active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-30"
          >
            {pending ? "…" : "Join"}
          </button>
        </div>
      )}

      {error && (
        <p className="border-l-2 border-oxblood bg-oxblood/5 px-3 py-1.5 text-xs text-oxblood">
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
    <section className="w-full space-y-3 rounded-sm border border-line-soft bg-surface/40 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[11px] uppercase tracking-[0.22em] text-ink-faint">
          Your stats
        </h2>
        <span className="text-[11px] uppercase tracking-[0.18em] text-ink-faint">
          across all groups
        </span>
      </div>
      <div className="font-serif text-3xl text-ink">
        {data.totalMatches}{" "}
        <span className="text-base text-ink-faint normal-case">
          {data.totalMatches === 1 ? "match" : "matches"} played
        </span>
      </div>
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
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className="text-ink">{label}</span>
      <span className="text-ink-soft">{detail}</span>
    </div>
  );
}
