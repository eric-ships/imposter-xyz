"use client";

// /auth — sign-in form. Single email input, "Send link" button,
// then a "check your inbox" confirmation. Used both for upgrading
// a device-bound account AND for signing in on a new device with
// an existing email.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useTheme } from "@/lib/theme";
import { getOrMintDeviceToken } from "@/lib/identity";

function PageThemeToggle() {
  const { theme, toggle } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted ? theme === "dark" : false;
  return (
    <button
      onClick={toggle}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className="flex h-9 w-9 items-center justify-center text-ink-faint transition hover:text-ink active:scale-90"
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

export default function AuthPage() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Surface a failed Discord round-trip — the OAuth callback redirects
  // back here with ?discord=error when something went wrong.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("discord") === "error") {
      setError("Discord sign-in didn't go through. Please try again.");
    }
  }, []);

  function signInWithDiscord() {
    const token = getOrMintDeviceToken();
    const qs = token ? `?deviceToken=${encodeURIComponent(token)}` : "";
    window.location.href = `/api/auth/discord/start${qs}`;
  }

  async function send() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/auth/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmed,
          deviceToken: getOrMintDeviceToken() ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "send failed");
      setSent(trimmed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "send failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className="fixed right-4 top-4 z-50">
        <PageThemeToggle />
      </div>
      <main className="mx-auto flex w-full max-w-md flex-col gap-7 px-6 pb-12 pt-10 sm:pt-16 lg:max-w-lg lg:pt-24">
        <Link
          href="/"
          className="text-[11px] uppercase tracking-[0.2em] text-ink-faint transition hover:text-ink"
        >
          ← Home
        </Link>

        {sent ? (
          <section className="space-y-4">
            <header className="space-y-2">
              <div className="text-[11px] uppercase tracking-[0.22em] text-ink-faint">
                Almost there
              </div>
              <h1 className="font-serif text-3xl text-ink">
                Check your inbox
              </h1>
            </header>
            <p className="text-sm leading-relaxed text-ink-soft">
              A one-time sign-in link is on its way to{" "}
              <span className="text-ink">{sent}</span>. Click it within
              the next 15 minutes to claim your account.
            </p>
            <p className="text-xs text-ink-faint">
              Didn&apos;t arrive? Check your spam folder, or{" "}
              <button
                onClick={() => {
                  setSent(null);
                  setEmail(sent);
                }}
                className="border-b border-ink-faint pb-0.5 text-ink-soft transition hover:border-ink hover:text-ink"
              >
                send another
              </button>
              .
            </p>
          </section>
        ) : (
          <section className="space-y-5">
            <header className="space-y-2">
              <div className="text-[11px] uppercase tracking-[0.22em] text-ink-faint">
                Sign in
              </div>
              <h1 className="font-serif text-3xl text-ink">
                Sign in to Upper
              </h1>
              <p className="text-sm leading-relaxed text-ink-soft">
                You only need an account to create or join a
                squad — casual play works without one. Email lets your
                stats and squad memberships follow you across devices.
                We&apos;ll send a one-time link.
              </p>
            </header>

            <label className="block">
              <span className="mb-2 block text-[11px] uppercase tracking-[0.2em] text-ink-faint">
                Email
              </span>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && email.trim() && !pending) send();
                }}
                placeholder="you@example.com"
                autoFocus
                type="email"
                name="email"
                inputMode="email"
                autoComplete="email"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                className="w-full border-b border-line bg-transparent px-1 pb-2 text-xl text-ink outline-none transition placeholder:text-ink-faint focus:border-accent"
              />
            </label>

            <button
              onClick={send}
              disabled={pending || email.trim().length === 0}
              className="w-full rounded-sm bg-ink px-6 py-4 text-[11px] uppercase tracking-[0.2em] text-page transition-all duration-100 hover:bg-accent active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-30"
            >
              {pending ? "Sending…" : "Send sign-in link"}
            </button>

            <div className="flex items-center gap-3" aria-hidden>
              <span className="h-px flex-1 bg-line" />
              <span className="text-[11px] uppercase tracking-[0.2em] text-ink-faint">
                or
              </span>
              <span className="h-px flex-1 bg-line" />
            </div>

            <button
              onClick={signInWithDiscord}
              className="flex w-full items-center justify-center gap-2.5 rounded-sm bg-[#5865F2] px-6 py-4 text-[11px] uppercase tracking-[0.2em] text-white transition-all duration-100 hover:bg-[#4752c4] active:scale-[0.97]"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden
              >
                <path d="M20.317 4.369A19.79 19.79 0 0 0 16.558 3c-.21.375-.444.88-.608 1.27a18.27 18.27 0 0 0-5.487 0A12.6 12.6 0 0 0 9.847 3 19.74 19.74 0 0 0 6.084 4.37C2.61 9.56 1.67 14.62 2.14 19.61a19.94 19.94 0 0 0 6.05 3.04c.49-.67.927-1.38 1.3-2.13-.713-.27-1.396-.602-2.04-.99.171-.127.34-.26.5-.396 3.927 1.83 8.18 1.83 12.06 0 .163.137.332.27.5.396-.645.39-1.33.722-2.043.992.375.75.81 1.46 1.3 2.13a19.9 19.9 0 0 0 6.053-3.04c.553-5.78-.945-10.79-3.96-15.24ZM8.68 16.54c-1.183 0-2.157-1.085-2.157-2.42 0-1.334.955-2.42 2.157-2.42 1.21 0 2.176 1.095 2.157 2.42 0 1.335-.955 2.42-2.157 2.42Zm6.64 0c-1.183 0-2.157-1.085-2.157-2.42 0-1.334.955-2.42 2.157-2.42 1.21 0 2.176 1.095 2.157 2.42 0 1.335-.946 2.42-2.157 2.42Z" />
              </svg>
              Continue with Discord
            </button>

            <p className="text-xs leading-relaxed text-ink-faint">
              Already signed in on another device? Just open Upper there
              — your account follows.
            </p>

            {error && (
              <p className="border-l-2 border-oxblood bg-oxblood/5 px-3 py-2 text-sm text-oxblood">
                {error}
              </p>
            )}
          </section>
        )}
      </main>
    </>
  );
}
