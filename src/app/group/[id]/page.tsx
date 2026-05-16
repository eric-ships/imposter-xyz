"use client";

// Friend group page. Roster + invite code + owner controls.
// Stats / recent matches tabs come in Phase 4 (the schema for those
// doesn't exist yet anyway). For now this is the "what is this
// group, who's in it, how do people join, am I leaving" view.
import {
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useIdentity } from "@/lib/identity";
import { useTheme } from "@/lib/theme";
import { PalettePicker } from "@/components/PalettePicker";
import { avatarFor } from "@/lib/avatar";
import type { MatchHistoryEntry } from "@/lib/match-history";

type GroupMember = {
  userId: string;
  nickname: string;
  role: string;
  joinedAt: string;
  defaultAvatar: string | null;
  lastSeenAt: string | null;
};

type GroupDetail = {
  id: string;
  name: string;
  inviteCode: string;
  ownerUserId: string;
  createdAt: string;
  members: GroupMember[];
};

export default function GroupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: groupId } = use(params);
  const router = useRouter();
  const identity = useIdentity();

  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<"idle" | "ok" | "err" | "forbidden">(
    "idle"
  );
  const [activeTab, setActiveTab] = useState<"roster" | "stats" | "recent">(
    "roster"
  );

  const refetch = useCallback(async () => {
    if (!identity.userId) return;
    try {
      const res = await fetch(
        `/api/groups/${groupId}?userId=${identity.userId}`
      );
      if (res.status === 403) {
        setLoadState("forbidden");
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "load failed");
        setLoadState("err");
        return;
      }
      setGroup(data as GroupDetail);
      setLoadState("ok");
    } catch (e) {
      setError(e instanceof Error ? e.message : "load failed");
      setLoadState("err");
    }
  }, [groupId, identity.userId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  if (!identity.ready) {
    return <SmallShell>Loading…</SmallShell>;
  }
  if (loadState === "forbidden") {
    return (
      <SmallShell>
        <div className="space-y-4">
          <h1 className="font-serif text-2xl text-ink">
            Not a member
          </h1>
          <p className="text-sm text-ink-soft">
            Ask the host for the group&apos;s invite code, then join from
            the home page.
          </p>
          <Link
            href="/"
            className="inline-block rounded-sm border border-ink px-4 py-2 text-[11px] uppercase tracking-[0.2em] text-ink transition hover:bg-ink hover:text-page"
          >
            Back home
          </Link>
        </div>
      </SmallShell>
    );
  }
  if (loadState === "err") {
    return <SmallShell>{error ?? "Could not load group."}</SmallShell>;
  }
  if (!group) {
    return <SmallShell>Loading…</SmallShell>;
  }

  const isOwner = group.ownerUserId === identity.userId;

  return (
    <>
      {/* Theme toggle pinned to viewport top-right (was absolute
          inside main → wandered to mid-screen on widescreens). */}
      <div className="fixed right-4 top-4 z-50 flex items-center gap-1">
        <PalettePicker />
        <PageThemeToggle />
      </div>
      <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-6 pb-12 pt-8 sm:pt-10 lg:max-w-3xl lg:gap-7 lg:pt-12">
        <Link
          href="/"
          className="text-[11px] uppercase tracking-[0.2em] text-ink-faint transition hover:text-ink"
        >
          ← Home
        </Link>

        <header className="space-y-2">
          <div className="text-[11px] uppercase tracking-[0.22em] text-ink-faint">
            Friend group
          </div>
          {isOwner ? (
            <RenameTitle
              initial={group.name}
              groupId={group.id}
              userId={identity.userId!}
              onRenamed={(next) => setGroup({ ...group, name: next })}
            />
          ) : (
            <h1 className="font-serif text-3xl text-ink lg:text-4xl">
              {group.name}
            </h1>
          )}
          <InviteChip code={group.inviteCode} />
        </header>

        {/* Tab nav. Bigger touch targets on mobile (py-2.5 → 44px
            tap area), stays compact visually via text-xs. */}
        <nav className="flex gap-1 border-b border-line">
          {(["roster", "stats", "recent"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setActiveTab(t)}
              className={`-mb-px min-h-[44px] border-b-2 px-4 py-2.5 text-[11px] uppercase tracking-[0.2em] transition ${
                activeTab === t
                  ? "border-ink text-ink"
                  : "border-transparent text-ink-faint hover:text-ink"
              }`}
            >
              {t === "roster"
                ? "Roster"
                : t === "stats"
                  ? "Stats"
                  : "Recent"}
            </button>
          ))}
        </nav>

        {activeTab === "roster" && (
          <RosterTab
            group={group}
            identity={identity}
            isOwner={isOwner}
            refetch={refetch}
            onLeft={() => router.push("/")}
            onDeleted={() => router.push("/")}
          />
        )}
        {activeTab === "stats" && (
          <StatsTab groupId={group.id} userId={identity.userId!} />
        )}
        {activeTab === "recent" && (
          <RecentTab groupId={group.id} userId={identity.userId!} />
        )}
      </main>
    </>
  );
}

// Roster tab: extracted from the original page body so the tab nav
// can swap it in/out cleanly.
function RosterTab({
  group,
  identity,
  isOwner,
  refetch,
  onLeft,
  onDeleted,
}: {
  group: GroupDetail;
  identity: { userId: string | null };
  isOwner: boolean;
  refetch: () => void;
  onLeft: () => void;
  onDeleted: () => void;
}) {
  return (
    <>
      <section className="space-y-3">
        <h2 className="text-[11px] uppercase tracking-[0.22em] text-ink-faint">
          Members · {group.members.length}
        </h2>
        <ul className="divide-y divide-line-soft border-y border-line-soft">
          {group.members.map((m) => {
            const av = avatarFor(
              m.userId,
              m.nickname,
              m.defaultAvatar,
              group.members.map((mem) => ({ id: mem.userId }))
            );
            const isMe = m.userId === identity.userId;
            return (
              <li
                key={m.userId}
                className="flex items-center gap-3 py-3"
              >
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${av.color} ${
                    av.isCustom
                      ? "border border-line text-base"
                      : "text-sm font-semibold text-white"
                  }`}
                >
                  {av.initial}
                </div>
                <div className="flex flex-1 items-baseline gap-2">
                  <span className="text-sm text-ink">{m.nickname}</span>
                  {m.role === "owner" && (
                    <span className="text-[10px] uppercase tracking-[0.18em] text-accent">
                      Owner
                    </span>
                  )}
                  {isMe && (
                    <span className="text-[10px] uppercase tracking-[0.18em] text-ink-faint">
                      you
                    </span>
                  )}
                  <PresencePill lastSeenAt={m.lastSeenAt} />
                </div>
                {isOwner && !isMe && (
                  <KickMemberButton
                    groupId={group.id}
                    ownerId={identity.userId!}
                    targetUserId={m.userId}
                    targetNickname={m.nickname}
                    onKicked={refetch}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-[11px] uppercase tracking-[0.22em] text-ink-faint">
          {isOwner ? "Owner controls" : "Group actions"}
        </h2>
        {!isOwner && (
          <LeaveButton
            groupId={group.id}
            userId={identity.userId!}
            onLeft={onLeft}
          />
        )}
        {isOwner && (
          <DeleteButton
            groupId={group.id}
            userId={identity.userId!}
            onDeleted={onDeleted}
          />
        )}
      </section>
    </>
  );
}

// ─── Stats tab ─────────────────────────────────────────────────────

type GameRollup = {
  imposter: {
    played: number;
    asImposter: { played: number; won: number };
    asCrewmate: { played: number; won: number };
    totalDelta: number;
  };
  wavelength: { played: number; won: number; totalDelta: number };
  justOne: { played: number; totalDelta: number };
};

type StatsResponse = {
  totalMatches: number;
  perMember: Array<{
    userId: string;
    nickname: string;
    role: string;
    defaultAvatar: string | null;
    games: GameRollup;
  }>;
};

function StatsTab({
  groupId,
  userId,
}: {
  groupId: string;
  userId: string;
}) {
  const [data, setData] = useState<StatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetch(`/api/groups/${groupId}/stats?userId=${userId}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "load failed");
        return body as StatsResponse;
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [groupId, userId]);

  if (error) {
    return (
      <p className="border-l-2 border-oxblood bg-oxblood/5 px-3 py-2 text-sm text-oxblood">
        {error}
      </p>
    );
  }
  if (!data) {
    return (
      <p className="text-xs uppercase tracking-[0.2em] text-ink-faint">
        Loading…
      </p>
    );
  }
  if (data.totalMatches === 0) {
    return (
      <div className="rounded-sm border border-line-soft bg-surface/40 p-4 text-sm text-ink-soft">
        No matches yet. Play a game with this group attributed
        (lobby pill) and the stats will start showing up.
      </div>
    );
  }

  // Sort members by total matches played desc — most-active first.
  const sorted = [...data.perMember].sort((a, b) => {
    const aPlayed =
      a.games.imposter.played +
      a.games.wavelength.played +
      a.games.justOne.played;
    const bPlayed =
      b.games.imposter.played +
      b.games.wavelength.played +
      b.games.justOne.played;
    return bPlayed - aPlayed;
  });

  return (
    <div className="space-y-5">
      <div className="text-[11px] uppercase tracking-[0.2em] text-ink-faint">
        {data.totalMatches}{" "}
        {data.totalMatches === 1 ? "match" : "matches"} total
      </div>
      <ul className="space-y-3">
        {sorted.map((m) => {
          const av = avatarFor(
            m.userId,
            m.nickname,
            m.defaultAvatar,
            sorted.map((s) => ({ id: s.userId }))
          );
          const totalPlayed =
            m.games.imposter.played +
            m.games.wavelength.played +
            m.games.justOne.played;
          return (
            <li
              key={m.userId}
              className="rounded-sm border border-line-soft bg-page/40 p-3"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${av.color} ${
                    av.isCustom
                      ? "border border-line text-base"
                      : "text-sm font-semibold text-white"
                  }`}
                >
                  {av.initial}
                </div>
                <div className="flex flex-1 items-baseline gap-2">
                  <span className="text-sm text-ink">{m.nickname}</span>
                  {m.role === "owner" && (
                    <span className="text-[10px] uppercase tracking-[0.18em] text-accent">
                      Owner
                    </span>
                  )}
                </div>
                <span className="text-[11px] uppercase tracking-[0.18em] text-ink-faint">
                  {totalPlayed} played
                </span>
              </div>

              {/* Per-game breakdown — only show games this player has
                  actually played to keep the panel lean. */}
              <div className="mt-2 space-y-1.5">
                {m.games.imposter.played > 0 && (
                  <ImposterStatRow stats={m.games.imposter} />
                )}
                {m.games.wavelength.played > 0 && (
                  <WavelengthStatRow stats={m.games.wavelength} />
                )}
                {m.games.justOne.played > 0 && (
                  <JustOneStatRow stats={m.games.justOne} />
                )}
                {totalPlayed === 0 && (
                  <p className="text-[11px] text-ink-faint">
                    Hasn&apos;t played a group-attributed match yet.
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ImposterStatRow({
  stats,
}: {
  stats: GameRollup["imposter"];
}) {
  const impWinRate =
    stats.asImposter.played === 0
      ? null
      : Math.round((stats.asImposter.won / stats.asImposter.played) * 100);
  const crewWinRate =
    stats.asCrewmate.played === 0
      ? null
      : Math.round((stats.asCrewmate.won / stats.asCrewmate.played) * 100);
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className="text-ink-soft">
        Imposter <span className="text-ink-faint">·</span>{" "}
        {stats.played} played
      </span>
      <span className="flex items-baseline gap-3 text-ink-soft">
        {stats.asImposter.played > 0 && (
          <span>
            <span className="text-oxblood">imp</span>{" "}
            <span className="text-ink">
              {stats.asImposter.won}/{stats.asImposter.played}
            </span>
            {impWinRate !== null && (
              <span className="ml-1 text-ink-faint">({impWinRate}%)</span>
            )}
          </span>
        )}
        {stats.asCrewmate.played > 0 && (
          <span>
            <span className="text-leaf">crew</span>{" "}
            <span className="text-ink">
              {stats.asCrewmate.won}/{stats.asCrewmate.played}
            </span>
            {crewWinRate !== null && (
              <span className="ml-1 text-ink-faint">({crewWinRate}%)</span>
            )}
          </span>
        )}
      </span>
    </div>
  );
}

function WavelengthStatRow({
  stats,
}: {
  stats: GameRollup["wavelength"];
}) {
  const winRate =
    stats.played === 0
      ? null
      : Math.round((stats.won / stats.played) * 100);
  const avgPts =
    stats.played === 0
      ? null
      : Math.round(stats.totalDelta / stats.played);
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className="text-ink-soft">
        Wavelength <span className="text-ink-faint">·</span>{" "}
        {stats.played} played
      </span>
      <span className="text-ink-soft">
        <span className="text-ink">
          {stats.won}/{stats.played}
        </span>{" "}
        {winRate !== null && (
          <span className="text-ink-faint">({winRate}%)</span>
        )}
        {avgPts !== null && (
          <span className="ml-2 text-ink-faint">avg {avgPts} pts</span>
        )}
      </span>
    </div>
  );
}

function JustOneStatRow({
  stats,
}: {
  stats: GameRollup["justOne"];
}) {
  const avg =
    stats.played === 0
      ? null
      : (stats.totalDelta / stats.played).toFixed(1);
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className="text-ink-soft">
        Just One <span className="text-ink-faint">·</span>{" "}
        {stats.played} played
      </span>
      <span className="text-ink-soft">
        {avg !== null && (
          <span>
            avg <span className="text-ink">{avg}</span> per match
          </span>
        )}
      </span>
    </div>
  );
}

// ─── Recent tab ────────────────────────────────────────────────────

type RecentMatch = {
  id: string;
  gameKind: string;
  endedAt: string;
  roomCode: string;
  snapshot: MatchHistoryEntry;
};

function RecentTab({
  groupId,
  userId,
}: {
  groupId: string;
  userId: string;
}) {
  const [matches, setMatches] = useState<RecentMatch[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetch(`/api/groups/${groupId}/recent?userId=${userId}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "load failed");
        return body as { matches: RecentMatch[] };
      })
      .then((d) => {
        if (!cancelled) setMatches(d.matches);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [groupId, userId]);

  if (error) {
    return (
      <p className="border-l-2 border-oxblood bg-oxblood/5 px-3 py-2 text-sm text-oxblood">
        {error}
      </p>
    );
  }
  if (!matches) {
    return (
      <p className="text-xs uppercase tracking-[0.2em] text-ink-faint">
        Loading…
      </p>
    );
  }
  if (matches.length === 0) {
    return (
      <div className="rounded-sm border border-line-soft bg-surface/40 p-4 text-sm text-ink-soft">
        No matches yet.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {matches.map((m) => (
        <RecentMatchCard key={m.id} match={m} />
      ))}
    </div>
  );
}

function RecentMatchCard({ match }: { match: RecentMatch }) {
  let endedTime = "";
  try {
    endedTime = new Date(match.endedAt).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    /* ignore */
  }

  if (
    "kind" in match.snapshot &&
    match.snapshot.kind === "wavelength"
  ) {
    const w = match.snapshot;
    const winnerNames = w.winnerIds
      .map(
        (id) =>
          w.perPlayer.find((p) => p.playerId === id)?.nickname ?? "?"
      )
      .join(" & ");
    return (
      <div className="rounded-sm border border-line-soft bg-page/40 px-3 py-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <div className="text-[11px] uppercase tracking-[0.2em] text-ink-faint">
            Wavelength · {endedTime}
          </div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-leaf">
            {w.winnerIds.length === 1 ? "Winner" : "Tied"}
          </div>
        </div>
        <div className="mt-1 text-sm text-ink">
          <span className="font-semibold">{winnerNames}</span>{" "}
          <span className="text-ink-faint">· {w.topScore} pts</span>
        </div>
      </div>
    );
  }

  if (
    "kind" in match.snapshot &&
    match.snapshot.kind === "just-one"
  ) {
    const j = match.snapshot;
    return (
      <div className="rounded-sm border border-line-soft bg-page/40 px-3 py-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <div className="text-[11px] uppercase tracking-[0.2em] text-ink-faint">
            Just One · {endedTime}
          </div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-leaf">
            {j.score} / {j.totalCards}
          </div>
        </div>
        <div className="mt-1 text-sm text-ink-soft">{j.rating}</div>
      </div>
    );
  }

  // Imposter
  const im = match.snapshot;
  const winnerLabel =
    im.winner === "imposter"
      ? "Imposter wins"
      : im.winner === "crewmates"
        ? "Crewmates win"
        : "Split";
  const winnerColor =
    im.winner === "imposter"
      ? "text-oxblood"
      : im.winner === "crewmates"
        ? "text-leaf"
        : "text-accent";
  return (
    <div className="rounded-sm border border-line-soft bg-page/40 px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-[11px] uppercase tracking-[0.2em] text-ink-faint">
          Imposter · {endedTime}
        </div>
        <div
          className={`text-[11px] uppercase tracking-[0.18em] ${winnerColor}`}
        >
          {winnerLabel}
        </div>
      </div>
      <div className="mt-1 text-sm text-ink">
        <span className="text-ink-faint">{im.category}</span>{" "}
        <span className="text-ink-faint">·</span>{" "}
        <span className="font-semibold">{im.secretWord}</span>
      </div>
    </div>
  );
}

// ─── Subcomponents ─────────────────────────────────────────────────

function SmallShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 py-10 text-center text-sm text-ink-soft">
      {children}
    </main>
  );
}

function PageThemeToggle() {
  const { theme, toggle } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted ? theme === "dark" : false;
  return (
    <button
      onClick={toggle}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className="flex h-8 w-8 items-center justify-center text-ink-faint transition hover:text-ink active:scale-90"
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

function InviteChip({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        try {
          navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* ignore */
        }
      }}
      className="inline-flex items-baseline gap-2 rounded-full border border-line bg-page px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-ink-faint transition hover:border-ink hover:text-ink"
    >
      <span>Invite code</span>
      <span className="font-serif text-base tracking-[0.3em] text-ink normal-case">
        {code}
      </span>
      <span className="text-[10px] tracking-[0.18em] text-accent">
        {copied ? "copied" : "tap to copy"}
      </span>
    </button>
  );
}

function PresencePill({ lastSeenAt }: { lastSeenAt: string | null }) {
  // Hydration guard: render nothing until client mount, then compute
  // the relative label. Re-renders every minute via interval.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  if (!lastSeenAt || now === null) return null;
  const ms = now - new Date(lastSeenAt).getTime();
  if (ms < 0) return null;
  let label = "";
  if (ms < 5 * 60_000) label = "online";
  else if (ms < 60 * 60_000) label = `${Math.floor(ms / 60_000)}m ago`;
  else if (ms < 24 * 60 * 60_000) label = `${Math.floor(ms / 3_600_000)}h ago`;
  else if (ms < 7 * 24 * 60 * 60_000) label = `${Math.floor(ms / 86_400_000)}d ago`;
  else label = "recently";
  return (
    <span className="text-[10px] uppercase tracking-[0.18em] text-ink-faint">
      · {label}
    </span>
  );
}

function RenameTitle({
  initial,
  groupId,
  userId,
  onRenamed,
}: {
  initial: string;
  groupId: string;
  userId: string;
  onRenamed: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset local state when the parent's initial changes (e.g. another
  // tab renamed and we refetched).
  useMemo(() => setName(initial), [initial]);

  if (!editing) {
    return (
      <div className="flex items-baseline gap-3">
        <h1 className="font-serif text-3xl text-ink">{initial}</h1>
        <button
          onClick={() => {
            setName(initial);
            setEditing(true);
          }}
          className="text-[11px] uppercase tracking-[0.18em] text-ink-faint transition hover:text-ink"
        >
          Rename
        </button>
      </div>
    );
  }

  async function save() {
    const next = name.trim();
    if (!next) return;
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/groups/${groupId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, name: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "rename failed");
      onRenamed(next);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "rename failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          autoFocus
          type="text"
          name="group-name"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="words"
          spellCheck={false}
          data-form-type="other"
          data-1p-ignore="true"
          data-lpignore="true"
          className="min-w-0 flex-1 border-b border-line bg-transparent px-1 pb-2 font-serif text-3xl text-ink outline-none transition focus:border-accent"
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim() && !pending) save();
            if (e.key === "Escape") setEditing(false);
          }}
        />
        <button
          onClick={save}
          disabled={pending || name.trim().length === 0}
          className="rounded-sm bg-ink px-4 text-[11px] uppercase tracking-[0.2em] text-page transition hover:bg-accent active:scale-[0.97] disabled:opacity-30"
        >
          {pending ? "…" : "Save"}
        </button>
        <button
          onClick={() => setEditing(false)}
          disabled={pending}
          className="rounded-sm border border-line px-3 text-[11px] uppercase tracking-[0.2em] text-ink-soft transition hover:border-ink hover:text-ink disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
      {error && (
        <p className="text-xs text-oxblood">{error}</p>
      )}
    </div>
  );
}

function KickMemberButton({
  groupId,
  ownerId,
  targetUserId,
  targetNickname,
  onKicked,
}: {
  groupId: string;
  ownerId: string;
  targetUserId: string;
  targetNickname: string;
  onKicked: () => void;
}) {
  const [armed, setArmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  async function commit() {
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/kick`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId, targetUserId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "kick failed");
      onKicked();
    } catch (e) {
      setError(e instanceof Error ? e.message : "kick failed");
      setArmed(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!armed) {
            setArmed(true);
            return;
          }
          void commit();
        }}
        title={`Remove ${targetNickname} from group`}
        className={`rounded-sm border px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] transition active:scale-[0.97] disabled:opacity-50 ${
          armed
            ? "border-oxblood bg-oxblood text-white hover:bg-oxblood/90"
            : "border-line text-ink-faint hover:border-oxblood hover:text-oxblood"
        }`}
      >
        {pending ? "…" : armed ? "Confirm?" : "Remove"}
      </button>
      {error && (
        <span className="mt-1 max-w-[160px] text-right text-[10px] text-oxblood">
          {error}
        </span>
      )}
    </div>
  );
}

function LeaveButton({
  groupId,
  userId,
  onLeft,
}: {
  groupId: string;
  userId: string;
  onLeft: () => void;
}) {
  const [armed, setArmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  async function commit() {
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "leave failed");
      onLeft();
    } catch (e) {
      setError(e instanceof Error ? e.message : "leave failed");
      setArmed(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!armed) {
            setArmed(true);
            return;
          }
          void commit();
        }}
        className={`w-full rounded-sm border px-4 py-2.5 text-[11px] uppercase tracking-[0.2em] transition active:scale-[0.98] disabled:opacity-50 ${
          armed
            ? "border-oxblood bg-oxblood text-white hover:bg-oxblood/90"
            : "border-line text-ink-soft hover:border-oxblood hover:text-oxblood"
        }`}
      >
        {pending ? "…" : armed ? "Confirm leave?" : "Leave group"}
      </button>
      {error && (
        <p className="border-l-2 border-oxblood bg-oxblood/5 px-3 py-1.5 text-xs text-oxblood">
          {error}
        </p>
      )}
    </div>
  );
}

function DeleteButton({
  groupId,
  userId,
  onDeleted,
}: {
  groupId: string;
  userId: string;
  onDeleted: () => void;
}) {
  const [armed, setArmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  async function commit() {
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/groups/${groupId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, confirm: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "delete failed");
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "delete failed");
      setArmed(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!armed) {
            setArmed(true);
            return;
          }
          void commit();
        }}
        className={`w-full rounded-sm border px-4 py-2.5 text-[11px] uppercase tracking-[0.2em] transition active:scale-[0.98] disabled:opacity-50 ${
          armed
            ? "border-oxblood bg-oxblood text-white hover:bg-oxblood/90"
            : "border-line text-ink-soft hover:border-oxblood hover:text-oxblood"
        }`}
      >
        {pending
          ? "…"
          : armed
            ? "Really delete? This cannot be undone."
            : "Delete group"}
      </button>
      {error && (
        <p className="border-l-2 border-oxblood bg-oxblood/5 px-3 py-1.5 text-xs text-oxblood">
          {error}
        </p>
      )}
    </div>
  );
}
