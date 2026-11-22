"use client";

import { useState, type FormEvent } from "react";
import { Logo } from "@/components/Logo";
import { btn, card, input } from "@/components/ui";

export function LoginScreen({ notice }: { notice?: string | null }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // Through the HTTP API, not a server action, so the rate limiter applies.
      const res = await fetch("/api/auth/sign-in/username", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      if (res.ok) {
        window.location.assign("/");
        return;
      }
      setError(res.status === 429 ? "Too many attempts. Try again in a few minutes." : "Invalid username or password.");
      setPassword("");
    } catch {
      setError("Could not reach the server.");
    }
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className={`${card} w-full max-w-sm space-y-4 p-6`}>
      <div className="flex flex-col items-center gap-2">
        <Logo size="lg" />
        <h1 className="text-xl font-bold tracking-tight">Barkat</h1>
        <p className="text-sm text-muted">Sign in to your books</p>
      </div>
      {notice && <p className="text-center text-sm text-ink2">{notice}</p>}
      <input
        type="text"
        autoFocus
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="Username"
        aria-label="Username"
        className={input}
      />
      <input
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        aria-label="Password"
        className={input}
      />
      {error && (
        <p className="text-sm text-bad" role="alert">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy || !username.trim() || !password} className={`${btn} w-full`}>
        {busy ? "Signing in..." : "Sign in"}
      </button>
      <p className="text-center text-xs text-muted">Accounts are created by an administrator.</p>
    </form>
  );
}
