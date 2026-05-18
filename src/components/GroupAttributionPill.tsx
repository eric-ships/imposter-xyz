"use client";

// Lobby pill that surfaces the room's friend-group attribution.
// Renders for everyone (read-only for non-hosts); the host can tap
// to open a small picker of "Casual" + their groups.
//
// Server enforces host-only + lobby-only + member-of-group on the
// underlying /attribute endpoint; this component just gates the UI.
import { useEffect, useRef, useState } from "react";

type GroupRow = {
  id: string;
  name: string;
  memberCount: number;
};

export function GroupAttributionPill({
  code,
  playerId,
  userId,
  isHost,
  isLobby,
  currentGroupId,
  currentGroupName,
}: {
  code: string;
  playerId: string;
  userId: string | null;
  isHost: boolean;
  isLobby: boolean;
  currentGroupId: string | null;
  currentGroupName: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState<GroupRow[] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);

  // Lazily load the user's groups when the picker opens.
  useEffect(() => {
    if (!open || !userId || groups !== null) return;
    fetch(`/api/groups?userId=${userId}`)
      .then(async (res) => {
        const data = await res.json();
        if (res.ok) setGroups(data.groups as GroupRow[]);
      })
      .catch(() => {});
  }, [open, userId, groups]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  async function pick(groupId: string | null) {
    if (groupId === currentGroupId) {
      setOpen(false);
      return;
    }
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/rooms/${code}/attribute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, userId, groupId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "attribute failed");
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "attribute failed");
    } finally {
      setPending(false);
    }
  }

  // Read-only path: not the host, OR not in the lobby.
  if (!isHost || !isLobby) {
    if (!currentGroupId) return null; // nothing useful to show
    return (
      <div className="inline-flex items-baseline gap-2 rounded-full border border-leaf/40 bg-leaf/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-leaf">
        <span>Playing as</span>
        <span className="font-medium text-ink">
          {currentGroupName ?? "?"}
        </span>
      </div>
    );
  }

  // Host + lobby: clickable.
  const label = currentGroupName ?? "Casual";
  return (
    <div ref={popRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={pending}
        className={`inline-flex items-baseline gap-2 rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.2em] transition disabled:opacity-50 ${
          currentGroupId
            ? "border-leaf/40 bg-leaf/5 text-leaf hover:border-leaf hover:bg-leaf/10"
            : "border-line text-ink-soft hover:border-ink hover:text-ink"
        }`}
      >
        <span>{currentGroupId ? "Playing as" : "Stats"}</span>
        <span
          className={`font-medium normal-case tracking-normal ${
            currentGroupId ? "text-ink" : ""
          }`}
        >
          {label}
        </span>
        <span aria-hidden>▾</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 min-w-[220px] rounded-xl border border-line bg-surface p-1 shadow-md">
          <PickerRow
            label="Casual"
            sub="No stats"
            selected={currentGroupId === null}
            disabled={pending}
            onClick={() => pick(null)}
          />
          {groups === null ? (
            <div className="px-3 py-2 text-[11px] text-ink-faint">
              Loading…
            </div>
          ) : groups.length === 0 ? (
            <div className="px-3 py-2 text-[11px] text-ink-faint">
              No squads yet — create one from the home page.
            </div>
          ) : (
            groups.map((g) => (
              <PickerRow
                key={g.id}
                label={g.name}
                sub={`${g.memberCount} ${g.memberCount === 1 ? "member" : "members"}`}
                selected={currentGroupId === g.id}
                disabled={pending}
                onClick={() => pick(g.id)}
              />
            ))
          )}
          {error && (
            <p className="border-t border-line-soft px-3 py-1.5 text-[11px] text-oxblood">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function PickerRow({
  label,
  sub,
  selected,
  disabled,
  onClick,
}: {
  label: string;
  sub: string;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={`flex w-full items-baseline justify-between gap-3 rounded-sm px-3 py-2 text-left transition disabled:opacity-50 ${
        selected
          ? "bg-accent/15 text-ink"
          : "text-ink-soft hover:bg-surface hover:text-ink"
      }`}
    >
      <span className="text-sm">{label}</span>
      <span className="text-[10px] uppercase tracking-[0.18em] text-ink-faint">
        {sub}
      </span>
    </button>
  );
}
