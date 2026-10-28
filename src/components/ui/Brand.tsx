/** The Tastespec mark: a filament bulb whose glow is the accent colour. */
export function BrandMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="bm-glow" cx="50%" cy="42%" r="50%">
          <stop offset="0%" stopColor="#ffcf8a" />
          <stop offset="55%" stopColor="#e8873a" />
          <stop offset="100%" stopColor="#c2611c" />
        </radialGradient>
      </defs>
      <circle cx="12" cy="10" r="8" fill="url(#bm-glow)" />
      <path d="M8.6 10.4c1.1-2.2 2.2 2.2 3.4 0s2.3 2.2 3.4 0" fill="none" stroke="#3a1f0c" strokeWidth="1.3" strokeLinecap="round" />
      <rect x="9" y="17.4" width="6" height="2.2" rx="1" fill="currentColor" />
      <rect x="9.8" y="20.3" width="4.4" height="1.6" rx="0.8" fill="currentColor" opacity="0.7" />
    </svg>
  );
}
