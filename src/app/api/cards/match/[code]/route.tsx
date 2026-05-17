import { ImageResponse } from "next/og";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { MatchHistoryEntry } from "@/lib/match-history";

// GET /api/cards/match/[code]
//
// Generates a 1200×630 OG image for the latest match in the room.
// Reads from rooms.match_history (lobby-scoped JSON), so the image
// is available as long as the room exists. Once the room is GC'd,
// the route 404s — by design. Fresh content is the point of viral
// share moments; cards beyond a session can be added later if we
// build a persistent card store.
//
// The image is always produced (no auth, no rate limit). It's
// public-by-nature: anyone with the room code already could share
// the result.

export const runtime = "edge";

const WIDTH = 1200;
const HEIGHT = 630;

// Brand colors — kept in sync with globals.css dark theme.
const PAGE = "#15130f";
const SURFACE = "#1c1a16";
const INK = "#f5efe3";
const INK_SOFT = "#bbb1a0";
const INK_FAINT = "#7a736b";
const ACCENT = "#c89344";
const LEAF = "#7d9b6c";
const OXBLOOD = "#c46a6a";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code: raw } = await params;
  const code = raw.toUpperCase();

  // Pull the room + its latest match snapshot.
  const { data: room } = await supabaseAdmin
    .from("rooms")
    .select("code, match_history")
    .eq("code", code)
    .maybeSingle();

  const history = (room?.match_history as MatchHistoryEntry[] | null) ?? [];
  const match = history.length > 0 ? history[0] : null;

  return new ImageResponse(<Card code={code} match={match} />, {
    width: WIDTH,
    height: HEIGHT,
  });
}

function Card({
  code,
  match,
}: {
  code: string;
  match: MatchHistoryEntry | null;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        background: PAGE,
        color: INK,
        padding: "56px 72px",
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, "Helvetica Neue", sans-serif',
      }}
    >
      <Header code={code} match={match} />

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "stretch",
        }}
      >
        {!match ? (
          <FallbackBody />
        ) : isWavelength(match) ? (
          <WavelengthBody match={match} />
        ) : isJustOne(match) ? (
          <JustOneBody match={match} />
        ) : isCrew(match) ? (
          <CrewBodyCard match={match} />
        ) : (
          <ImposterBody match={match} />
        )}
      </div>

      <Footer />
    </div>
  );
}

function Header({
  code,
  match,
}: {
  code: string;
  match: MatchHistoryEntry | null;
}) {
  const kind = !match
    ? "Upper"
    : isWavelength(match)
      ? "Wavelength"
      : isJustOne(match)
        ? "Just One"
        : isCrew(match)
          ? "Crew"
          : "Imposter";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        fontSize: 18,
        textTransform: "uppercase",
        letterSpacing: 4,
        color: INK_FAINT,
      }}
    >
      <span style={{ display: "flex", gap: 14, alignItems: "baseline" }}>
        <span
          style={{
            fontFamily: 'ui-serif, Georgia, "Iowan Old Style", serif',
            fontStyle: "italic",
            fontSize: 32,
            color: INK,
            letterSpacing: -1,
            textTransform: "none",
          }}
        >
          Upper
        </span>
        <span style={{ display: "flex" }}>·</span>
        <span style={{ display: "flex" }}>{kind}</span>
      </span>
      <span style={{ display: "flex", gap: 10 }}>
        <span>Room</span>
        <span style={{ color: INK, letterSpacing: 6 }}>{code}</span>
      </span>
    </div>
  );
}

function Footer() {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        fontSize: 18,
        textTransform: "uppercase",
        letterSpacing: 4,
        color: INK_FAINT,
        marginTop: 32,
      }}
    >
      upper.games
    </div>
  );
}

function FallbackBody() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 20,
      }}
    >
      <div
        style={{
          fontFamily: 'ui-serif, Georgia, "Iowan Old Style", serif',
          fontStyle: "italic",
          fontSize: 96,
          color: INK,
          letterSpacing: -3,
        }}
      >
        Upper
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 24,
          color: INK_SOFT,
        }}
      >
        Party games for the group.
      </div>
    </div>
  );
}

// ─── Imposter ─────────────────────────────────────────────────────

type ImposterEntry = Extract<MatchHistoryEntry, { kind?: "imposter" }>;

function isWavelength(
  m: MatchHistoryEntry
): m is Extract<MatchHistoryEntry, { kind: "wavelength" }> {
  return "kind" in m && m.kind === "wavelength";
}
function isJustOne(
  m: MatchHistoryEntry
): m is Extract<MatchHistoryEntry, { kind: "just-one" }> {
  return "kind" in m && m.kind === "just-one";
}
function isCrew(
  m: MatchHistoryEntry
): m is Extract<MatchHistoryEntry, { kind: "crew" }> {
  return "kind" in m && m.kind === "crew";
}

function ImposterBody({ match }: { match: ImposterEntry }) {
  const winnerLabel =
    match.winner === "imposter"
      ? "Imposter wins"
      : match.winner === "crewmates"
        ? "Crewmates win"
        : "Split point";
  const winnerColor =
    match.winner === "imposter"
      ? OXBLOOD
      : match.winner === "crewmates"
        ? LEAF
        : ACCENT;
  const imposterNames = match.perPlayer
    .filter((p) => p.wasImposter)
    .map((p) => p.nickname)
    .join(" & ");
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 24,
        alignItems: "center",
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: 16,
          textTransform: "uppercase",
          letterSpacing: 4,
          color: INK_FAINT,
        }}
      >
        {match.category}
      </div>
      <div
        style={{
          fontFamily: 'ui-serif, Georgia, "Iowan Old Style", serif',
          fontStyle: "italic",
          fontSize: 110,
          color: INK,
          letterSpacing: -2,
          lineHeight: 1,
        }}
      >
        {match.secretWord}
      </div>
      <div
        style={{
          display: "flex",
          padding: "8px 24px",
          border: `2px solid ${winnerColor}`,
          color: winnerColor,
          fontSize: 22,
          textTransform: "uppercase",
          letterSpacing: 4,
        }}
      >
        {winnerLabel}
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 22,
          color: INK_SOFT,
          marginTop: 8,
        }}
      >
        Imposter:&nbsp;
        <span style={{ color: INK }}>{imposterNames || "?"}</span>
        {match.guess && (
          <>
            &nbsp;· guessed&nbsp;
            <span style={{ color: INK }}>{match.guess}</span>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Wavelength ───────────────────────────────────────────────────

function WavelengthBody({
  match,
}: {
  match: Extract<MatchHistoryEntry, { kind: "wavelength" }>;
}) {
  const winnerNames = match.winnerIds
    .map(
      (id) => match.perPlayer.find((p) => p.playerId === id)?.nickname ?? "?"
    )
    .join(" & ");
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 24,
        alignItems: "center",
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: 16,
          textTransform: "uppercase",
          letterSpacing: 4,
          color: INK_FAINT,
        }}
      >
        {match.winnerIds.length === 1 ? "Winner" : "Tied"}
      </div>
      <div
        style={{
          fontFamily: 'ui-serif, Georgia, "Iowan Old Style", serif',
          fontStyle: "italic",
          fontSize: 96,
          color: LEAF,
          letterSpacing: -2,
          lineHeight: 1.05,
          textAlign: "center",
          padding: "0 40px",
        }}
      >
        {winnerNames}
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 28,
          color: INK,
        }}
      >
        {match.topScore}
        <span style={{ color: INK_FAINT }}>
          &nbsp;points · {match.totalRounds} rounds
        </span>
      </div>
    </div>
  );
}

// ─── Crew ─────────────────────────────────────────────────────────

function CrewBodyCard({
  match,
}: {
  match: Extract<MatchHistoryEntry, { kind: "crew" }>;
}) {
  const won = match.outcome === "won";
  const tasksDone = match.perPlayer.filter((p) => p.taskDone).length;
  const resultColor = won ? LEAF : OXBLOOD;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 24,
        alignItems: "center",
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: 16,
          textTransform: "uppercase",
          letterSpacing: 4,
          color: INK_FAINT,
        }}
      >
        Mission {match.matchNumber}
      </div>
      <div
        style={{
          display: "flex",
          fontFamily: 'ui-serif, Georgia, "Iowan Old Style", serif',
          fontStyle: "italic",
          fontSize: 110,
          color: resultColor,
          letterSpacing: -2,
          lineHeight: 1,
        }}
      >
        {won ? "Mission won" : "Mission lost"}
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 28,
          color: INK,
        }}
      >
        {tasksDone} / {match.taskCount}
        <span style={{ color: INK_FAINT }}>&nbsp;tasks completed</span>
      </div>
    </div>
  );
}

// ─── Just One ─────────────────────────────────────────────────────

function JustOneBody({
  match,
}: {
  match: Extract<MatchHistoryEntry, { kind: "just-one" }>;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 18,
        alignItems: "center",
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: 16,
          textTransform: "uppercase",
          letterSpacing: 4,
          color: INK_FAINT,
        }}
      >
        Final score
      </div>
      <div
        style={{
          display: "flex",
          fontFamily: 'ui-serif, Georgia, "Iowan Old Style", serif',
          fontStyle: "italic",
          fontSize: 160,
          color: LEAF,
          letterSpacing: -4,
          lineHeight: 1,
        }}
      >
        {match.score} / {match.totalCards}
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 30,
          color: INK,
        }}
      >
        {match.rating}
      </div>
    </div>
  );
}
