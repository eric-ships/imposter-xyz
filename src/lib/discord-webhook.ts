// Posts a finished match to a friend group's linked Discord channel
// via an incoming webhook. Entirely best-effort: a missing URL, a 4xx,
// or a network error are swallowed and logged — a group's Discord link
// must never block or fail match recording.

import type {
  CrewMatchEntry,
  HoldMatchEntry,
  ImposterMatchEntry,
  JustOneMatchEntry,
  MatchHistoryEntry,
  WavelengthMatchEntry,
} from "@/lib/match-history";

const GAME_LABELS: Record<string, string> = {
  imposter: "Imposter",
  wavelength: "Wavelength",
  "just-one": "Just One",
  crew: "Crew",
  hold: "Hold",
};

// Upper's red accent (#b04a4a), as the integer Discord embeds expect.
const EMBED_COLOR = 0xb04a4a;

// Accepts the discord.com / discordapp.com webhook forms, including
// the canary and ptb subdomains. Exported so the save route can
// validate before persisting.
const WEBHOOK_RE =
  /^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/;

export function isDiscordWebhookUrl(value: string): boolean {
  return WEBHOOK_RE.test(value.trim());
}

function names(
  entries: Array<{ playerId: string; nickname: string }>,
  ids: Iterable<string>
): string {
  const idSet = new Set(ids);
  const picked = entries
    .filter((p) => idSet.has(p.playerId))
    .map((p) => p.nickname);
  return picked.join(" & ");
}

// One-line, human summary of a finished match, varying by game kind.
function summarize(snapshot: MatchHistoryEntry): string {
  const kind = "kind" in snapshot && snapshot.kind ? snapshot.kind : "imposter";

  if (kind === "wavelength") {
    const w = snapshot as WavelengthMatchEntry;
    const winners = names(w.perPlayer, w.winnerIds) || "Nobody";
    return `**${winners}** topped the dial with **${w.topScore}** across ${w.totalRounds} rounds.`;
  }

  if (kind === "just-one") {
    const j = snapshot as JustOneMatchEntry;
    return `The table guessed **${j.score}/${j.totalCards}** — *${j.rating}*.`;
  }

  if (kind === "crew") {
    const c = snapshot as CrewMatchEntry;
    const done = c.perPlayer.filter((p) => p.taskDone).length;
    return c.outcome === "won"
      ? `The crew pulled it off — **all ${c.taskCount} tasks** complete. 🎉`
      : `The crew fell short — **${done}/${c.taskCount} tasks** done.`;
  }

  if (kind === "hold") {
    const h = snapshot as HoldMatchEntry;
    return h.outcome === "victory"
      ? `**Victory** — all ${h.totalWaves} waves held, core at **${h.coreHp} HP**.`
      : `**Defeat** on wave **${h.waveReached}/${h.totalWaves}**.`;
  }

  const im = snapshot as ImposterMatchEntry;
  const imposters =
    names(
      im.perPlayer,
      im.perPlayer.filter((p) => p.wasImposter).map((p) => p.playerId)
    ) || "The imposter";
  const word = `**${im.secretWord}** (${im.category})`;
  if (im.winner === "imposter") {
    return `${imposters} got away with it. The word was ${word}.`;
  }
  if (im.winner === "crewmates") {
    return `The crew caught ${imposters}. The word was ${word}.`;
  }
  return `A draw — ${imposters} was caught but guessed close. The word was ${word}.`;
}

export async function postMatchToDiscord(args: {
  webhookUrl: string;
  groupName: string;
  gameKind: string;
  snapshot: MatchHistoryEntry;
}): Promise<void> {
  try {
    const label = GAME_LABELS[args.gameKind] ?? args.gameKind;
    const res = await fetch(args.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [
          {
            title: `${label} · ${args.groupName}`,
            description: summarize(args.snapshot),
            color: EMBED_COLOR,
            footer: { text: "Upper · upper.games" },
            timestamp: args.snapshot.endedAt,
          },
        ],
      }),
    });
    if (!res.ok) {
      console.warn(
        JSON.stringify({
          event: "discord_webhook_failed",
          status: res.status,
          ts: Date.now(),
        })
      );
    }
  } catch (e) {
    console.warn(
      JSON.stringify({
        event: "discord_webhook_threw",
        error: e instanceof Error ? e.message : String(e),
        ts: Date.now(),
      })
    );
  }
}
