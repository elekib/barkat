"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { Logo } from "./Logo";
import { NAV, isActive } from "./nav";
import { UserMenu } from "./UserMenu";

export interface NavSpace {
  id: number;
  name: string;
}

interface Props {
  spaces: NavSpace[];
  /** The month to open a space on. */
  ym: string;
  username: string;
  role: string;
  version: string;
}

const pill = (active: boolean) =>
  `whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
    active ? "bg-accent text-accent-ink" : "text-ink2 hover:bg-surface2 hover:text-ink"
  }`;

/** Top bar: brand, spaces, and the user menu. On phones the spaces scroll in their own row. */
export function NavBar({ spaces, ym, username, role, version }: Props) {
  const path = usePathname();
  const bar = useRef<HTMLElement>(null);
  // Publish the bar's height so sticky page headers can sit right under it, on any screen size.
  useEffect(() => {
    const el = bar.current;
    if (!el) return;
    const publish = () => document.documentElement.style.setProperty("--nav-h", `${el.offsetHeight}px`);
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const spaceLinks = spaces.map((s) => {
    const active = path.startsWith(`/s/${s.id}/`) || path === `/s/${s.id}`;
    return (
      <Link key={s.id} href={`/s/${s.id}/${ym}`} className={pill(active)} aria-current={active ? "page" : undefined}>
        {s.name}
      </Link>
    );
  });

  return (
    <header ref={bar} className="sticky top-0 z-20 border-b border-line bg-[color-mix(in_srgb,var(--page)_90%,transparent)] backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-2.5">
        <Link href="/" className="-m-1.5 flex items-center gap-2 rounded-xl p-1.5 text-ink focus-visible:outline-offset-0" aria-label="Barkat home">
          <Logo />
          <span className="text-base font-bold tracking-tight">Barkat</span>
        </Link>

        <nav aria-label="Books" className="-my-1 hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto px-1 py-1 md:flex">
          <Link href="/" className={pill(path === "/")} aria-current={path === "/" ? "page" : undefined}>
            Overview
          </Link>
          {spaceLinks}
        </nav>

        <div className="ml-auto flex items-center gap-1 md:ml-0">
          {role === "admin" && (
            <Link href="/users" className={`${pill(isActive(path, "/users"))} hidden md:inline-block`}>
              Users
            </Link>
          )}
          <UserMenu username={username} role={role} version={version} />
        </div>
      </div>

      <nav aria-label="Books" className="flex gap-1 overflow-x-auto px-4 pb-2 pt-1 md:hidden">
        {spaceLinks}
      </nav>
    </header>
  );
}

/** Bottom tabs for phones. */
export function MobileNav({ isAdmin }: { isAdmin: boolean }) {
  const path = usePathname();
  const items = NAV.filter((n) => !n.admin || isAdmin);
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface md:hidden">
      <ul className="flex">
        {items.map((n) => {
          const active = n.href === "/" ? path === "/" || path.startsWith("/s/") : isActive(path, n.href);
          return (
            <li key={n.href} className="flex-1">
              <Link
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition ${active ? "text-accent" : "text-muted hover:text-ink"}`}
              >
                <span className="text-xl leading-none" aria-hidden>
                  <n.icon className="h-6 w-6" />
                </span>
                {n.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
