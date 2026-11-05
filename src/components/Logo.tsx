export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id="omni-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5AC8FA" />
          <stop offset=".55" stopColor="#0A84FF" />
          <stop offset="1" stopColor="#5E5CE6" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill="url(#omni-g)" />
      <path d="M21 26a11 11 0 0 1 19-5.5M43 38a11 11 0 0 1-19 5.5" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M41 13v8h-8M23 51v-8h8" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
