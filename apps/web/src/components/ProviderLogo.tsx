const LOGO_SIZE = 80

function KubernetesLogo() {
  return (
    <svg viewBox="0 0 256 249" width={LOGO_SIZE} height={LOGO_SIZE} aria-hidden role="img">
      <title>Kubernetes</title>
      {/* Kubernetes wheel - 7 spokes */}
      <g transform="translate(128,124)">
        <circle cx="0" cy="0" r="112" fill="#326CE5" />
        <circle cx="0" cy="0" r="95" fill="none" stroke="#fff" strokeWidth="5" />
        {/* Center hub */}
        <circle cx="0" cy="0" r="18" fill="#fff" />
        {/* 7 spokes */}
        {[0, 1, 2, 3, 4, 5, 6].map((i) => {
          const angle = (i * 360) / 7 - 90
          const rad = (angle * Math.PI) / 180
          const x1 = Math.cos(rad) * 22
          const y1 = Math.sin(rad) * 22
          const x2 = Math.cos(rad) * 72
          const y2 = Math.sin(rad) * 72
          const tipX = Math.cos(rad) * 88
          const tipY = Math.sin(rad) * 88
          return (
            <g key={i}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fff" strokeWidth="8" strokeLinecap="round" />
              <circle cx={tipX} cy={tipY} r="12" fill="#fff" />
            </g>
          )
        })}
      </g>
    </svg>
  )
}

function MinikubeLogo() {
  return <KubernetesLogo />
}

function EksLogo() {
  return (
    <svg viewBox="0 0 100 60" width={LOGO_SIZE} height={LOGO_SIZE * 0.6} aria-hidden role="img">
      <title>AWS</title>
      {/* AWS smile/arrow */}
      <path
        d="M12 38 Q50 52 88 38"
        fill="none"
        stroke="#FF9900"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M72 34 L88 38 L78 48"
        fill="none"
        stroke="#FF9900"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* AWS text */}
      <text x="50" y="28" textAnchor="middle" fontFamily="Arial,sans-serif" fontWeight="bold" fontSize="26" fill="#232F3E">
        AWS
      </text>
    </svg>
  )
}

function GkeLogo() {
  return (
    <svg viewBox="0 0 100 80" width={LOGO_SIZE} height={LOGO_SIZE * 0.8} aria-hidden role="img">
      <title>Google Cloud</title>
      {/* Simplified Google Cloud logo - cloud shape with Google colors */}
      <path
        d="M72 56H28a20 20 0 01-3.5-39.7A16 16 0 0154 14a24 24 0 0143.5 10A16 16 0 0188 56h-16"
        fill="none"
        stroke="#4285F4"
        strokeWidth="5"
        strokeLinecap="round"
      />
      {/* Google 4-color dots inside the cloud */}
      <circle cx="35" cy="42" r="5" fill="#EA4335" />
      <circle cx="50" cy="35" r="5" fill="#4285F4" />
      <circle cx="65" cy="42" r="5" fill="#FBBC05" />
      <circle cx="50" cy="50" r="5" fill="#34A853" />
    </svg>
  )
}

function AksLogo() {
  return (
    <svg viewBox="0 0 100 100" width={LOGO_SIZE} height={LOGO_SIZE} aria-hidden role="img">
      <title>Microsoft Azure</title>
      {/* Azure logo - two triangles */}
      <path d="M28 76L52 18l14 34H40l22 24H28z" fill="#0078D4" />
      <path d="M58 36l18 40H48l10-16 0-24z" fill="#0078D4" opacity="0.7" />
    </svg>
  )
}

const PROVIDER_LOGOS: Record<string, () => React.ReactNode> = {
  minikube: MinikubeLogo,
  eks: EksLogo,
  gke: GkeLogo,
  aks: AksLogo,
}

export function ProviderLogo({ provider }: { provider: string }) {
  const Logo = PROVIDER_LOGOS[provider.toLowerCase()] ?? KubernetesLogo
  return (
    <div
      className="absolute right-3 bottom-3 pointer-events-none"
      style={{
        opacity: 'var(--watermark-opacity)',
        zIndex: 2,
      }}
    >
      <Logo />
    </div>
  )
}
