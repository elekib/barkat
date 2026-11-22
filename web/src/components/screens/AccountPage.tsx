"use client";

// Sessions come from the server render.

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { changePassword, logoutEverywhere, revokeSession } from "@/app/actions/auth";
import { useToast } from "@/components/Toast";
import { btn, btnDanger, btnQuiet, card, input } from "@/components/ui";
import type { User } from "@/lib/auth/accounts";
import { BackButton } from "@/components/BackButton";

export interface Session {
  id: string;
  created_at: number;
  last_used_at: number;
  expires_at: number;
  user_agent: string | null;
  ip: string | null;
  current: boolean;
}

const fmt = (secs: number) => new Date(secs * 1000).toLocaleString();

function describeAgent(ua: string | null): string {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

export function AccountPage({ user, sessions }: { user: User; sessions: Session[] }) {
  const notify = useToast();
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (next !== confirm) {
      notify("New passwords do not match", "error");
      return;
    }
    setSaving(true);
    // Redirects to sign-in on success.
    const r = await changePassword(current, next);
    if (r?.error) {
      notify(r.error, "error");
      setSaving(false);
    }
  };

  const revoke = async (id: string) => {
    const r = await revokeSession(id);
    if (r.error) notify(r.error, "error");
    else {
      notify("Session signed out");
      router.refresh();
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <BackButton href="/">Back to Books</BackButton>
        <h1 className="text-2xl font-bold tracking-tight">Account</h1>
      </div>

      <div className={`${card} p-5`}>
        <div className="text-lg font-semibold">{user.username}</div>
        <div className="text-sm text-muted">{user.role === "admin" ? "Administrator" : "Viewer (read-only)"}</div>
      </div>

      <form onSubmit={submit} className={`${card} space-y-3 p-5`}>
        <h2 className="text-base font-semibold">Change password</h2>
        <p className="text-sm text-muted">Changing your password signs you out on every device.</p>
        <input type="password" autoComplete="current-password" placeholder="Current password" aria-label="Current password" value={current} onChange={(e) => setCurrent(e.target.value)} className={input} />
        <input type="password" autoComplete="new-password" placeholder="New password (at least 12 characters)" aria-label="New password" value={next} onChange={(e) => setNext(e.target.value)} className={input} />
        <input type="password" autoComplete="new-password" placeholder="Repeat new password" aria-label="Repeat new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={input} />
        {next !== "" && next.length < 12 && <p className="text-sm text-ink2">New password must be at least 12 characters ({next.length}/12).</p>}
        {confirm !== "" && confirm !== next && <p className="text-sm text-ink2">Passwords do not match.</p>}
        <button type="submit" disabled={saving || !current || next.length < 12 || next !== confirm} className={btn}>
          {saving ? "Saving..." : "Change password"}
        </button>
      </form>

      <div className={`${card} space-y-3 p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Active sessions</h2>
          <form action={logoutEverywhere}>
            <button className={btnQuiet}>Sign out everywhere</button>
          </form>
        </div>
        {sessions.length === 0 ? (
          <p className="text-sm text-muted">No active sessions.</p>
        ) : (
          <ul className="divide-y divide-line">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="font-medium">
                    {describeAgent(s.user_agent)}
                    {s.current && <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-ink">This device</span>}
                  </div>
                  <div className="text-xs text-muted">
                    {s.ip ?? "unknown address"} · signed in {fmt(s.created_at)} · last active {fmt(s.last_used_at)}
                  </div>
                </div>
                {!s.current && (
                  <button onClick={() => revoke(s.id)} className={`${btnDanger} shrink-0`}>
                    Sign out
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
