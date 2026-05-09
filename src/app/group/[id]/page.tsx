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
import { avatarFor } from "@/lib/avatar";

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
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-7 px-6 py-10">
      <div className="absolute right-4 top-4">
        <PageThemeToggle />
      </div>

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
          <h1 className="font-serif text-3xl text-ink">{group.name}</h1>
        )}
        <InviteChip code={group.inviteCode} />
      </header>

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
            onLeft={() => router.push("/")}
          />
        )}
        {isOwner && (
          <DeleteButton
            groupId={group.id}
            userId={identity.userId!}
            onDeleted={() => router.push("/")}
          />
        )}
      </section>
    </main>
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
