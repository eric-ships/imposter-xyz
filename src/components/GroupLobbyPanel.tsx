"use client";

// Lobby "who's missing" panel for group-attributed rooms. Fetches the
// friend group's roster and cross-references it against the players
// already in the room (matched by user id) so the table can see who
// from the group still needs to join. There's no push system, so
// "inviting" is just sharing the room code.
//
// Renders nothing unless the viewer is a member of the group: the
// roster endpoint is member-gated and returns 403 otherwise.
import { useEffect, useState } from "react";
import type { PublicRoomView } from "@/lib/game";

type GroupMember = {
  userId: string;
  nickname: string;
};

type GroupDetail = {
  name: string;
  members: GroupMember[];
};

export function GroupLobbyPanel({
  view,
  userId,
}: {
  view: PublicRoomView;
  userId: string | null;
}) {
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [copied, setCopied] = useState(false);

  const groupId = view.groupId;

  useEffect(() => {
    if (!groupId || !userId) return;
    let cancelled = false;
    fetch(`/api/groups/${groupId}?userId=${userId}`)
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as GroupDetail;
      })
      .then((data) => {
        if (!cancelled && data) setGroup(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [groupId, userId]);

  // Non-member, still loading, or fetch failed: render nothing.
  if (!group) return null;

  const presentUserIds = new Set(
    view.players.map((p) => p.userId).filter((id): id is string => !!id)
  );
  const here = group.members.filter((m) => presentUserIds.has(m.userId));
  const missing = group.members.filter((m) => !presentUserIds.has(m.userId));
  const total = group.members.length;
  const everyoneHere = missing.length === 0;

  return (
    <section className="space-y-3 rounded-xl border-2 border-leaf/40 bg-leaf/5 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-leaf">
          {everyoneHere
            ? `All of ${group.name} is here`
            : `${here.length}/${total} of ${group.name} here`}
        </div>
      </div>

      {everyoneHere ? (
        <p className="text-[12px] text-ink-soft">
          The whole group made it in. Start when you&rsquo;re ready.
        </p>
      ) : (
        <div className="space-y-1.5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-ink-faint">
            Still missing
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {missing.map((m) => (
              <li
                key={m.userId}
                className="rounded-full border-2 border-line bg-surface/40 px-2.5 py-0.5 text-[12px] text-ink-soft"
              >
                {m.nickname}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-1.5">
        <p className="text-[11px] uppercase tracking-[0.18em] text-ink-faint">
          {everyoneHere ? "Room code" : "Send them the code"}
        </p>
        <div className="flex items-center gap-2">
          <span className="rounded-xl border-2 border-line bg-surface/40 px-4 py-2 text-base font-bold tracking-[0.25em] text-ink">
            {view.code}
          </span>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(view.code);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent transition hover:text-ink"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
    </section>
  );
}
