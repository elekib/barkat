import type { IconType } from "react-icons";

/** A soft accent tile around an icon, for section titles. Decorative: the title carries the meaning. */
export function IconChip({ icon: Icon, size = "md" }: { icon: IconType; size?: "sm" | "md" }) {
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-accent ${size === "sm" ? "h-7 w-7" : "h-9 w-9"}`}
    >
      <Icon className={size === "sm" ? "h-4 w-4" : "h-5 w-5"} />
    </span>
  );
}
