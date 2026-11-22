"use client";

// The list comes from the server render.

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { FormState } from "@/app/actions/auth";
import { createUser, deleteUser, resetPassword, revokeUserSessions, updateUser } from "@/app/actions/users";
import { useToast } from "@/components/Toast";
import { btn, btnDanger, btnQuiet, card, input } from "@/components/ui";
import type { Role, User } from "@/lib/auth/accounts";
import { BackButton } from "@/components/BackButton";

export function UsersPage({ me, users }: { me: User; users: User[] }) {
  const notify = useToast();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("viewer");
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [resetPw, setResetPw] = useState("");

  const run = async (action: () => Promise<FormState>) => {
    const r = await action();
    if (r.error) notify(r.error, "error");
    else {
      if (r.message) notify(r.message);
      router.refresh();
    }
    return !r.error;
  };

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (await run(() => createUser(username.trim(), password, role))) {
      setUsername("");
      setPassword("");
    }
  };

  const remove = (u: User) => {
    if (window.confirm(`Delete ${u.username}? Their sessions end immediately.`)) void run(() => deleteUser(u.id));
  };

  const submitReset = async (u: User) => {
    if (await run(() => resetPassword(u.id, resetPw))) {
      setResetFor(null);
      setResetPw("");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <BackButton href="/">Back to Books</BackButton>
        <h1 className="text-2xl font-bold tracking-tight">Users</h1>
      </div>

      <form onSubmit={create} className={`${card} space-y-3 p-5`}>
        <h2 className="text-base font-semibold">Add user</h2>
        <div className="flex flex-wrap gap-3">
          <input className={`${input} min-w-[10rem] flex-1`} placeholder="Username" aria-label="Username" autoComplete="off" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} />
          <input className={`${input} min-w-[12rem] flex-1`} type="password" autoComplete="new-password" placeholder="Password (12+ characters)" aria-label="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <select className={`${input} !w-auto`} aria-label="Role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="admin">Admin</option>
            <option value="viewer">Viewer (read-only)</option>
          </select>
          <button type="submit" disabled={!username.trim() || password.length < 12} className={btn}>
            Create
          </button>
        </div>
        {password !== "" && password.length < 12 && <p className="text-sm text-ink2">Password must be at least 12 characters ({password.length}/12).</p>}
        <p className="text-xs text-muted">
          Admins can edit and manage users. Viewers see the books but cannot change them. Share the password over a private channel; people can change it on their Account page.
        </p>
      </form>

      <div className={`${card} p-5`}>
        <ul className="divide-y divide-line">
          {users.map((u) => (
            <li key={u.id} className="space-y-2 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{u.username}</span>
                  {u.id === me.id && <span className="text-xs text-muted">(you)</span>}
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${u.role === "admin" ? "bg-accent text-accent-ink" : "bg-surface2 text-ink2"}`}>{u.role}</span>
                  {u.disabled && <span className="rounded-full bg-bad px-2 py-0.5 text-xs font-semibold text-white">disabled</span>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className={btnQuiet} onClick={() => run(() => updateUser(u.id, { role: u.role === "admin" ? "viewer" : "admin" }))}>
                    Make {u.role === "admin" ? "viewer" : "admin"}
                  </button>
                  <button className={btnQuiet} onClick={() => run(() => updateUser(u.id, { disabled: !u.disabled }))}>
                    {u.disabled ? "Enable" : "Disable"}
                  </button>
                  <button className={btnQuiet} onClick={() => { setResetFor(resetFor === u.id ? null : u.id); setResetPw(""); }}>
                    Reset password
                  </button>
                  <button className={btnQuiet} onClick={() => run(() => revokeUserSessions(u.id))}>
                    Revoke sessions
                  </button>
                  {u.id !== me.id && (
                    <button className={btnDanger} onClick={() => remove(u)}>
                      Delete
                    </button>
                  )}
                </div>
              </div>
              {resetFor === u.id && (
                <div className="flex flex-wrap gap-2">
                  <input className={`${input} min-w-[12rem] flex-1`} type="password" autoComplete="new-password" placeholder="New password (12+ characters)" aria-label={`New password for ${u.username}`} value={resetPw} onChange={(e) => setResetPw(e.target.value)} />
                  <button className={btn} disabled={resetPw.length < 12} onClick={() => void submitReset(u)}>
                    Set password
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
