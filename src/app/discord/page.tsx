"use client";

// /discord — the Embedded App Activity entry point.
//
// Loaded inside Discord's Activity iframe. It connects the Embedded
// App SDK, signs the player in via Discord OAuth, resolves the room
// shared by this voice-channel Activity instance, then hands off to
// the normal room page. Everyone in the same Activity instance lands
// in the same room.
//
// Opened outside Discord it can't connect (the SDK has no frame to
// talk to) and shows a "launch from Discord" message instead.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Phase = "connecting" | "signing-in" | "joining" | "error";

const PHASE_LABEL: Record<Exclude<Phase, "error">, string> = {
  connecting: "Connecting to Discord…",
  "signing-in": "Signing you in…",
  joining: "Opening the room…",
};

export default function DiscordActivityPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("connecting");
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    // Guard against the effect firing twice (React strict mode) — the
    // OAuth handshake must run exactly once.
    if (started.current) return;
    started.current = true;
    void boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function boot() {
    try {
      const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!clientId) {
        throw new Error("Activity is not configured (missing client id).");
      }
      if (!supabaseUrl) {
        throw new Error("Activity is not configured (missing Supabase URL).");
      }

      // Dynamically import the SDK so it never evaluates during SSR.
      const { DiscordSDK, patchUrlMappings } = await import(
        "@discord/embedded-app-sdk"
      );

      // Supabase lives on a different origin, so the iframe CSP would
      // block its realtime websocket. Route it through Discord's proxy
      // (the portal must declare the matching /supabase URL mapping).
      // This patches the global fetch + WebSocket, so it must run
      // before any Supabase client connects — including on the room
      // page we hand off to, which keeps this SPA's globals.
      patchUrlMappings([
        { prefix: "/supabase", target: new URL(supabaseUrl).host },
      ]);

      const sdk = new DiscordSDK(clientId);
      setPhase("connecting");
      await sdk.ready();

      // OAuth: authorize → exchange the code server-side → authenticate.
      setPhase("signing-in");
      const { code } = await sdk.commands.authorize({
        client_id: clientId,
        response_type: "code",
        scope: ["identify"],
      });

      const authRes = await fetch("/api/discord/activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const auth = await authRes.json();
      if (!authRes.ok) {
        throw new Error(auth.error ?? "sign-in failed");
      }
      await sdk.commands.authenticate({ access_token: auth.accessToken });

      // Resolve the room shared by this Activity instance.
      setPhase("joining");
      const roomRes = await fetch("/api/discord/activity/room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceId: sdk.instanceId }),
      });
      const room = await roomRes.json();
      if (!roomRes.ok) {
        throw new Error(room.error ?? "could not open the room");
      }

      // Hand our Discord-linked identity to the room page via the
      // device-token key its identity bootstrap reads, then hand off.
      // router.replace keeps the SPA context so the URL-mapping patch
      // above stays in effect for the room's realtime subscription.
      try {
        window.localStorage.setItem("imposter:userId", auth.deviceToken);
      } catch {
        /* storage disabled — the room page will mint its own */
      }
      router.replace(`/room/${room.code}`);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Something went wrong connecting."
      );
      setPhase("error");
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="font-serif text-3xl italic text-ink">Upper</div>
      {phase === "error" ? (
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-ink-soft">{error}</p>
          <p className="text-xs text-ink-faint">
            Launch Upper from a Discord voice channel to play here.
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
          {PHASE_LABEL[phase]}
        </div>
      )}
    </main>
  );
}
