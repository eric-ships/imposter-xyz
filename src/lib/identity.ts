"use client";

// Device-bound identity bootstrap. On first visit, mints a UUID into
// localStorage; on every visit, POSTs to /api/users/me to upsert the
// users row + bump last_seen_at (presence ping for the future
// roster "active Xm ago" badge).
//
// Cross-device portability is intentionally NOT a v1 feature — losing
// localStorage means a fresh identity. Email/wallet auth can layer on
// later without changing the data model.
import { useEffect, useState } from "react";

const DEVICE_TOKEN_KEY = "imposter:userId";

// Storage helpers. Wrapped in try/catch since localStorage can throw
// in private mode / disabled storage / SSR — the bootstrap silently
// no-ops in that case.
function readDeviceToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(DEVICE_TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeDeviceToken(token: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DEVICE_TOKEN_KEY, token);
  } catch {
    /* private mode etc — silent no-op */
  }
}

// Generate a UUID. Uses crypto.randomUUID() when available (modern
// browsers + secure contexts), falls back to a Math.random() v4 for
// edge cases (very old browsers, http origins). The fallback isn't
// cryptographically random but device tokens don't need to be —
// they're just collision-resistant identifiers.
function mintUuid(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  // RFC4122 v4-ish fallback
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getOrMintDeviceToken(): string | null {
  if (typeof window === "undefined") return null;
  let token = readDeviceToken();
  if (!token) {
    token = mintUuid();
    writeDeviceToken(token);
  }
  return token;
}

// Sign out: unbind this device from its account on the server, then
// drop the local device token so the next bootstrap mints a fresh
// device-only identity. The account itself — and its email / Discord
// link — is untouched and can be signed back into. Best-effort: the
// local clear is what actually logs you out, so a failed request
// doesn't strand the caller.
export async function signOut(): Promise<void> {
  const token = readDeviceToken();
  if (token) {
    try {
      await fetch("/api/auth/signout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceToken: token }),
      });
    } catch {
      /* network error — the local clear below still signs you out */
    }
  }
  try {
    window.localStorage.removeItem(DEVICE_TOKEN_KEY);
  } catch {
    /* private mode etc — silent no-op */
  }
}

export type IdentityState = {
  userId: string | null;
  defaultNickname: string | null;
  defaultAvatar: string | null;
  // Set once the user has claimed their account via magic link.
  // Null = device-only (the "Save your account" CTA shows when this
  // is null + ≥3 matches played).
  email: string | null;
  // Set once the user has linked a Discord account. Discord's
  // `identify` scope carries no email, so a Discord-only sign-in has
  // email: null and discordUsername set — the account display checks
  // both.
  discordUsername: string | null;
  // True once we've heard back from /api/users/me at least once.
  // Lets consumers gate "now I know who I am" UI without flickering
  // through a null state.
  ready: boolean;
};

const INITIAL: IdentityState = {
  userId: null,
  defaultNickname: null,
  defaultAvatar: null,
  email: null,
  discordUsername: null,
  ready: false,
};

// The last resolved identity, cached at module scope. A remount (e.g.
// the / ↔ /home redirect) seeds from this so the hook starts `ready`
// instead of flashing back through the loading state — it still
// re-pings /api/users/me in the background to refresh.
let cachedIdentity: IdentityState | null = null;

// Hook: ensures a device token exists, pings /api/users/me on mount,
// returns the resulting userId + profile. Optionally pass nickname /
// avatar discovered from elsewhere (e.g. an existing per-room
// localStorage entry) to seed the user row on first creation.
export function useIdentity({
  seedNickname,
  seedAvatar,
}: {
  seedNickname?: string | null;
  seedAvatar?: string | null;
} = {}): IdentityState {
  const [state, setState] = useState<IdentityState>(
    cachedIdentity ?? INITIAL
  );

  useEffect(() => {
    let cancelled = false;
    const token = getOrMintDeviceToken();
    if (!token) {
      // SSR or storage-disabled — leave state at INITIAL forever.
      return;
    }
    const body: Record<string, unknown> = { deviceToken: token };
    if (seedNickname && seedNickname.trim()) {
      body.defaultNickname = seedNickname.trim();
    }
    if (seedAvatar && seedAvatar.trim()) {
      body.defaultAvatar = seedAvatar.trim();
    }
    fetch("/api/users/me", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as {
          userId?: string;
          defaultNickname?: string | null;
          defaultAvatar?: string | null;
          email?: string | null;
          discordUsername?: string | null;
        };
        if (cancelled) return;
        const next: IdentityState = {
          userId: data.userId ?? null,
          defaultNickname: data.defaultNickname ?? null,
          defaultAvatar: data.defaultAvatar ?? null,
          email: data.email ?? null,
          discordUsername: data.discordUsername ?? null,
          ready: true,
        };
        cachedIdentity = next;
        setState(next);
      })
      .catch(() => {
        // Network error — leave ready: false. Caller can retry next
        // mount; presence ping is best-effort.
      });
    return () => {
      cancelled = true;
    };
    // Seeds intentionally NOT in deps — they should only seed once on
    // first mount, not re-fire whenever an upstream prop changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return state;
}
