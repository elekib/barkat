// Shared Tailwind class strings, so forms and buttons look the same everywhere.

export const focus = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export const input = `w-full min-w-0 rounded-lg border border-line bg-surface px-3 py-2 text-ink placeholder:text-muted hover:border-axis ${focus}`;

export const btn = `inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2 font-semibold text-accent-ink transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50 ${focus}`;

export const btnGhost = `inline-flex items-center justify-center rounded-lg border border-line bg-transparent px-3 py-1.5 text-sm font-medium text-accent transition hover:border-accent ${focus}`;

export const btnQuiet = `rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink2 transition hover:bg-surface2 hover:text-ink ${focus}`;

export const btnDanger = `rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-medium text-bad transition hover:border-bad ${focus}`;

/** `glass` adds the sheen layer (see globals.css); it is empty in light mode. */
export const card = "glass relative isolate rounded-2xl border border-line bg-surface shadow-card";

/** An editable table cell: looks like plain text until hovered or focused. */
export const cell = `w-full min-w-0 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm text-ink placeholder:text-muted hover:border-line focus:border-axis focus:bg-surface disabled:cursor-default disabled:opacity-100 disabled:hover:border-transparent ${focus}`;
