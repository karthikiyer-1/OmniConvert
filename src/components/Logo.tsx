/**
 * OmniConvert mark: an outlined circle flowing into a solid one —
 * one form becoming another. Monochrome; inverts with the theme.
 */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className="shrink-0 text-fg">
      <rect width="64" height="64" rx="15" fill="currentColor" />
      <circle cx="26" cy="32" r="12" fill="none" className="stroke-bg" strokeWidth="4" />
      <circle cx="38" cy="32" r="12" className="fill-bg" />
    </svg>
  );
}
