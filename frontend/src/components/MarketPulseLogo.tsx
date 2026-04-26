interface MarketPulseLogoProps {
  size?: number;
}

export function MarketPulseLogo({ size = 32 }: MarketPulseLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="48" height="48" rx="12" fill="url(#mp-bg)" />
      <rect x="6"  y="30" width="7" height="12" rx="2" fill="white" opacity="0.25" />
      <rect x="15" y="22" width="7" height="20" rx="2" fill="white" opacity="0.35" />
      <rect x="24" y="26" width="7" height="16" rx="2" fill="white" opacity="0.25" />
      <rect x="33" y="18" width="7" height="24" rx="2" fill="white" opacity="0.35" />
      <polyline
        points="6,32 12,32 15,20 19,36 22,28 26,28 30,16 34,24 42,24"
        stroke="white"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="30" cy="16" r="2.8" fill="white" />
      <defs>
        <linearGradient id="mp-bg" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#6C3AFF" />
          <stop offset="100%" stopColor="#2E9EFF" />
        </linearGradient>
      </defs>
    </svg>
  );
}
