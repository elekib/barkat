/**
 * The Barkat mark: a crescent cradling a coin, with a sparkle above. It is the "flat"
 * version (no starfield), which stays legible this small. Colours follow the theme
 * (tile = accent, marks = accent-ink). The full mark and other variants live in /branding.
 */
export function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  const box = size === "lg" ? "h-12 w-12 rounded-xl" : "h-7 w-7 rounded-lg";
  return (
    <span className={`inline-grid place-items-center bg-accent ${box}`} aria-hidden>
      <svg viewBox="8 14 80 76" className="h-[78%] w-[78%]" fill="none">
        <defs>
          <mask id="barkat-crescent">
            <rect width="100" height="100" fill="#fff" />
            <circle cx="60" cy="44" r="28" fill="#000" />
          </mask>
        </defs>
        <circle cx="46" cy="54" r="32" fill="var(--accent-ink)" mask="url(#barkat-crescent)" />
        <circle cx="62" cy="52" r="10.5" fill="var(--accent-ink)" opacity="0.62" />
        <path
          d="M76 18 L79 25 L86 28 L79 31 L76 38 L73 31 L66 28 L73 25 Z"
          fill="var(--accent-ink)"
          opacity="0.9"
        />
      </svg>
    </span>
  );
}
