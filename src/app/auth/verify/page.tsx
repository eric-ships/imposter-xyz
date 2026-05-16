"use client";

// /auth/verify?token=XYZ — landing page for the magic-link click.
// On mount: POST /api/auth/email/verify with the token + the
// device's localStorage token. Show success/error, redirect home
// after a brief pause on success.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getOrMintDeviceToken } from "@/lib/identity";

type Result =
  | { kind: "loading" }
  | { kind: "ok"; merged: boolean; email: string }
  | { kind: "err"; error: string };

export default function VerifyPage() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");
  const [result, setResult] = useState<Result>({ kind: "loading" });
  // Single-shot: never re-fire the verify (would 400 since the token
  // was marked used by the first call).
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    if (!token) {
      setResult({ kind: "err", error: "missing token" });
      return;
    }
    fetch("/api/auth/email/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        deviceToken: getOrMintDeviceToken() ?? undefined,
      }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setResult({ kind: "err", error: data.error ?? "verify failed" });
          return;
        }
        setResult({
          kind: "ok",
          merged: !!data.merged,
          email: data.email ?? "",
        });
      })
      .catch((e) => {
        setResult({
          kind: "err",
          error: e instanceof Error ? e.message : "verify failed",
        });
      });
  }, [token]);

  // Auto-redirect on success after a brief moment so users can
  // register the success screen.
  useEffect(() => {
    if (result.kind !== "ok") return;
    const t = setTimeout(() => router.push("/"), 1400);
    return () => clearTimeout(t);
  }, [result, router]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-5 px-6 py-12 text-center">
      {result.kind === "loading" && (
        <>
          <div className="text-[11px] uppercase tracking-[0.22em] text-ink-faint">
            Signing you in
          </div>
          <h1 className="font-serif text-3xl italic text-ink">…</h1>
        </>
      )}
      {result.kind === "ok" && (
        <>
          <div className="text-[11px] uppercase tracking-[0.22em] text-leaf">
            {result.merged ? "Merged" : "Signed in"}
          </div>
          <h1 className="font-serif text-3xl text-ink">
            {result.merged
              ? "Stats brought along."
              : "Account claimed."}
          </h1>
          <p className="text-sm text-ink-soft">
            {result.email && (
              <>
                Signed in as{" "}
                <span className="text-ink">{result.email}</span>.
              </>
            )}{" "}
            Redirecting home…
          </p>
        </>
      )}
      {result.kind === "err" && (
        <>
          <div className="text-[11px] uppercase tracking-[0.22em] text-oxblood">
            Couldn&apos;t sign in
          </div>
          <h1 className="font-serif text-3xl text-ink">
            Link no good
          </h1>
          <p className="text-sm text-ink-soft">{result.error}</p>
          <Link
            href="/auth"
            className="mt-2 rounded-sm border border-ink px-5 py-2 text-[11px] uppercase tracking-[0.2em] text-ink transition-all duration-100 hover:bg-ink hover:text-page active:scale-[0.97]"
          >
            Request a new link
          </Link>
        </>
      )}
    </main>
  );
}
