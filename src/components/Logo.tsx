/** Monochrome app mark: inverts with the theme via currentColor. */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className="text-fg">
      <rect width="64" height="64" rx="14" fill="currentColor" />
      <g fill="none" className="stroke-bg" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 27a10.5 10.5 0 0 1 18.2-5M42 37a10.5 10.5 0 0 1-18.2 5" />
        <path d="M40.5 15v7h-7M23.5 49v-7h7" />
      </g>
    </svg>
  );
}
