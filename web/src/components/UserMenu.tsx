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

  const item = "block w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-surface2";

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
          <Link href="/account" role="menuitem" className={item} onClick={() => setOpen(false)}>
            Account
          </Link>
          {role === "admin" && (
            <Link href="/users" role="menuitem" className={item} onClick={() => setOpen(false)}>
              Users
            </Link>
          )}
          <div className="px-3 py-2">
            <div className="mb-1 text-xs text-muted">Theme</div>
            <ThemeToggle />
          </div>
          <div className="my-1 border-t border-line" />
          <form action={logout}>
            <button role="menuitem" className={`${item} text-bad`}>
              Sign out
            </button>
          </form>
          <div className="px-3 pt-1 text-xs text-muted">Barkat {version}</div>
        </div>
      )}
    </div>
  );
}
