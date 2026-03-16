'use client'

/**
 * Voyager Logo — Rocket/space-themed SVG brand mark
 * Used on login page and other branding surfaces.
 */
export function VoyagerLogo({ className = '', size = 48 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Outer glow ring */}
      <circle cx="32" cy="32" r="30" stroke="url(#logoGradient)" strokeWidth="2" opacity="0.3" />
      {/* Rocket body */}
      <path
        d="M32 8C32 8 22 20 22 36C22 44 26 50 32 54C38 50 42 44 42 36C42 20 32 8 32 8Z"
        fill="url(#logoGradient)"
        opacity="0.9"
      />
      {/* Rocket window */}
      <circle cx="32" cy="28" r="4" fill="var(--color-bg-primary, #0a0a0f)" stroke="url(#logoGradient)" strokeWidth="1.5" />
      {/* Rocket fins - left */}
      <path
        d="M22 38C22 38 16 42 14 46L22 44V38Z"
        fill="url(#logoGradient)"
        opacity="0.7"
      />
      {/* Rocket fins - right */}
      <path
        d="M42 38C42 38 48 42 50 46L42 44V38Z"
        fill="url(#logoGradient)"
        opacity="0.7"
      />
      {/* Exhaust flame */}
      <path
        d="M28 52C28 52 30 60 32 60C34 60 36 52 36 52C36 52 34 56 32 56C30 56 28 52 28 52Z"
        fill="#f59e0b"
        opacity="0.8"
      />
      <path
        d="M30 53C30 53 31 58 32 58C33 58 34 53 34 53C34 53 33 56 32 56C31 56 30 53 30 53Z"
        fill="#fbbf24"
        opacity="0.9"
      />
      {/* Stars */}
      <circle cx="10" cy="14" r="1" fill="currentColor" opacity="0.4" />
      <circle cx="54" cy="12" r="1.2" fill="currentColor" opacity="0.3" />
      <circle cx="8" cy="48" r="0.8" fill="currentColor" opacity="0.35" />
      <circle cx="56" cy="44" r="1" fill="currentColor" opacity="0.25" />
      <circle cx="50" cy="24" r="0.6" fill="currentColor" opacity="0.4" />
      <circle cx="14" cy="30" r="0.8" fill="currentColor" opacity="0.3" />
      <defs>
        <linearGradient id="logoGradient" x1="14" y1="8" x2="50" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7c8cf8" />
          <stop offset="0.5" stopColor="#6366f1" />
          <stop offset="1" stopColor="#818cf8" />
        </linearGradient>
      </defs>
    </svg>
  )
}
