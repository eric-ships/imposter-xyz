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
                Use email to keep your stats across devices and sign in
                from anywhere. We&apos;ll send a one-time link.
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
