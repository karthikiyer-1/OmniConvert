/**
 * OmniConvert mark: an interlocking lowercase "o" and "c" monogram.
 * Drawn strokes, no tile or gradient; follows the text colour.
 */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="4 6 56 56" aria-hidden className="shrink-0 text-fg">
      <circle cx="22" cy="34" r="14" fill="none" stroke="currentColor" strokeWidth="7" />
      <path d="M50 22a14 14 0 1 0 0 24" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
    </svg>
  );
}
