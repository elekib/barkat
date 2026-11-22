"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { MdExpandMore } from "react-icons/md";

const KEY = (id: string) => `barkat:open:${id}`;

/**
 * A card whose body folds away. The heading is the toggle (a real button inside the heading, with
 * aria-expanded). Whether each section is open is remembered in this browser, by id; it starts open,
 * so the page is complete without any stored choice. The body stays mounted when folded, so
 * half-typed values in a row are not lost.
 */
export function Collapsible({
  id,
  chip,
  title,
  sub,
  stacked = false,
  summary,
  actions,
  className = "",
  as: Tag = "section",
  pad = "sm",
  children,
}: {
  id: string;
  chip: ReactNode;
  title: string;
  sub?: ReactNode;
  /** Put the sub text under the title (charts) instead of beside it (sheets). */
  stacked?: boolean;
  /** Shown beside the title only while folded: a number worth seeing without opening. */
  summary?: ReactNode;
  actions?: ReactNode;
  className?: string;
  as?: "section" | "article";
  /** Side padding of the card: the header highlight runs edge to edge, so the card pads its parts, not itself. */
  pad?: "sm" | "md";
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const body = useId();

  useEffect(() => {
    try {
      if (window.localStorage.getItem(KEY(id)) === "0") setOpen(false);
    } catch {
      /* storage blocked: stay open */
    }
  }, [id]);

  const toggle = () =>
    setOpen((o) => {
      try {
        window.localStorage.setItem(KEY(id), o ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !o;
    });

  const x = pad === "md" ? "px-5" : "px-4";
  return (
    <Tag className={`${className} overflow-hidden ${open ? "" : "self-start"}`}>
      <div
        className={`relative flex flex-wrap gap-x-3 gap-y-1 py-3 transition hover:bg-surface2 ${x} ${stacked ? "items-start" : "items-center"}`}
      >
        <h2 className="m-0 min-w-0 text-base font-semibold leading-tight">
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-controls={body}
            className="flex items-center gap-2.5 rounded-lg text-left after:absolute after:inset-0 focus-visible:outline-0 focus-visible:after:outline focus-visible:after:-outline-offset-2 focus-visible:after:outline-2 focus-visible:after:outline-accent"
          >
            <MdExpandMore className={`h-5 w-5 shrink-0 text-muted transition-transform ${open ? "" : "-rotate-90"}`} aria-hidden />
            {chip}
            <span className="min-w-0">
              {title}
              {stacked && sub && <span className="mt-0.5 block text-sm font-normal text-muted">{sub}</span>}
            </span>
          </button>
        </h2>
        {!stacked && sub && open && <span className="text-sm text-muted">{sub}</span>}
        {!open && summary && <span className="relative ml-auto self-center text-sm tabular-nums text-muted">{summary}</span>}
        {actions && open && <div className="relative z-10 ml-auto flex gap-2">{actions}</div>}
      </div>
      <div id={body} hidden={!open} className={`${x} pb-4 pt-1`}>
        {children}
      </div>
    </Tag>
  );
}
