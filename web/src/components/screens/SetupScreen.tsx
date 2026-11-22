"use client";

import { useState, type FormEvent } from "react";
import { setup } from "@/app/actions/auth";
import { Logo } from "@/components/Logo";
import { btn, card, input } from "@/components/ui";

/** First run: create the admin account with the one-time code printed in the server log. */
export function SetupScreen() {
  const [code, setCode] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const mismatch = confirm !== "" && confirm !== password;
  const tooShort = password !== "" && password.length < 12;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    // Redirects on success.
    const r = await setup(code.trim(), username.trim(), password);
    if (r?.error) setError(r.error);
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className={`${card} w-full max-w-md space-y-4 p-6`}>
      <div className="flex flex-col items-center gap-2">
        <Logo size="lg" />
        <h1 className="text-xl font-bold tracking-tight">Create the admin account</h1>
      </div>
      <p className="text-sm text-ink2">
        Barkat has no accounts yet. To prove you control this server, enter the one-time setup code from its log:
      </p>
      <pre className="overflow-x-auto rounded-lg bg-surface2 p-3 text-xs text-ink">docker logs barkat 2&gt;&amp;1 | grep -i &quot;setup code&quot;</pre>
      <p className="text-xs text-muted">Running without Docker? The code is in the terminal where you started the server.</p>
      <input
        type="text"
        autoFocus
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Setup code (xxxx-xxxx-xxxx-...)"
        aria-label="Setup code"
        className={`${input} font-mono`}
      />
      <input
        type="text"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="Admin username"
        aria-label="Admin username"
        className={input}
      />
      <input
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password (at least 12 characters)"
        aria-label="Password"
        className={input}
      />
      <input
        type="password"
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder="Repeat password"
        aria-label="Repeat password"
        className={input}
      />
      {tooShort && <p className="text-sm text-ink2">Password must be at least 12 characters ({password.length}/12).</p>}
      {mismatch && <p className="text-sm text-ink2">Passwords do not match.</p>}
      {error && (
        <p className="text-sm text-bad" role="alert">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy || !code.trim() || !username.trim() || password.length < 12 || mismatch || !confirm}
        className={`${btn} w-full`}
      >
        {busy ? "Creating..." : "Create admin and sign in"}
      </button>
    </form>
  );
}
