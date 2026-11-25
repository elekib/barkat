"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { logout } from "@/app/actions/auth";
import { ThemeToggle } from "./ThemeToggle";

/** The signed-in user's menu: account, users (admins), theme and sign out. */
export function UserMenu({ username, role, version }: { username: string; role: string; version: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item = "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface2";
  const icon = "h-5 w-5 shrink-0 text-muted";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border border-line bg-surface py-1 pl-1 pr-3 text-sm font-medium text-ink hover:bg-surface2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        <span className="grid h-7 w-7 place-items-center rounded-full bg-accent text-xs font-bold uppercase text-accent-ink" aria-hidden>
          {username.slice(0, 1)}
        </span>
        <span className="hidden max-w-[8rem] truncate sm:inline">{username}</span>
        <svg className="h-3 w-3 text-muted" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M2 4l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div role="menu" className="glass isolate absolute right-0 z-30 mt-2 w-60 rounded-xl border border-line bg-surface p-2 shadow-lg">
          <div className="px-3 py-2">
            <div className="truncate font-semibold">{username}</div>
            <div className="text-xs text-muted">{role === "admin" ? "Administrator" : "Viewer (read-only)"}</div>
          </div>
          <div className="my-1 border-t border-line" />
          {role === "admin" && (
            <Link href="/users" role="menuitem" className={`${item} text-ink`} onClick={() => setOpen(false)}>
              <svg className={icon} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M16 11a3 3 0 100-6 3 3 0 000 6zm-8 0a3 3 0 100-6 3 3 0 000 6zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
              </svg>
              Users
            </Link>
          )}
          <Link href="/account" role="menuitem" className={`${item} text-ink`} onClick={() => setOpen(false)}>
            <svg className={icon} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 12a4 4 0 100-8 4 4 0 000 8zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
            </svg>
            Account
          </Link>
          <div className="px-3 py-2">
            <div className="mb-1 text-xs text-muted">Theme</div>
            <ThemeToggle />
          </div>
          <div className="my-1 border-t border-line" />
          <form action={logout}>
            <button role="menuitem" className={`${item} text-bad`}>
              <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
              Sign out
            </button>
          </form>
          <div className="px-3 pt-1 text-xs text-muted">Barkat {version}</div>
        </div>
      )}
    </div>
  );
}
