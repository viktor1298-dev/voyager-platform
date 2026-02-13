const LOGO_SIZE = 80

const SVG_PROPS = {
  viewBox: '0 0 100 100',
  width: LOGO_SIZE,
  height: LOGO_SIZE,
  fill: 'white',
  'aria-hidden': true as const,
  role: 'img' as const,
}

function KubernetesLogo() {
  return (
    <svg {...SVG_PROPS}>
      <title>Kubernetes</title>
      <path d="M50 10L15 30v40l35 20 35-20V30L50 10zm0 8l28 16v32L50 82 22 66V34l28-16zm0 10a2 2 0 00-1 .3L35 36v20l14 7.7a2 2 0 002 0L65 56V36L51 28.3A2 2 0 0050 28z" />
    </svg>
  )
}

function MinikubeLogo() {
  return (
    <svg {...SVG_PROPS}>
      <title>Minikube</title>
      <circle cx="50" cy="50" r="35" strokeWidth="4" stroke="white" fill="none" />
      <path d="M35 40l15-10 15 10v20L50 70 35 60V40z" />
    </svg>
  )
}

function EksLogo() {
  return (
    <svg {...SVG_PROPS}>
      <title>AWS EKS</title>
      <path d="M50 15L20 30v40l30 15 30-15V30L50 15z" />
      <path
        d="M50 35l-15 8v16l15 8 15-8V43L50 35z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  )
}

function GkeLogo() {
  return (
    <svg {...SVG_PROPS}>
      <title>Google GKE</title>
      <path d="M50 10L15 30v40l35 20 35-20V30L50 10z" fillOpacity="0.6" />
      <polygon points="50,25 65,45 50,55 35,45" />
      <polygon points="50,55 65,45 65,65 50,75" />
      <polygon points="50,55 35,45 35,65 50,75" />
    </svg>
  )
}

function AksLogo() {
  return (
    <svg {...SVG_PROPS}>
      <title>Azure AKS</title>
      <rect x="20" y="20" width="60" height="60" rx="8" fillOpacity="0.5" />
      <path
        d="M35 50h30M50 35v30M38 38l24 24M62 38L38 62"
        stroke="white"
        strokeWidth="3"
        fill="none"
      />
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
      className="absolute right-2 bottom-2 pointer-events-none"
      style={{
        opacity: 'var(--watermark-opacity)',
        filter: 'blur(0.5px)',
        zIndex: 2,
      }}
    >
      <Logo />
    </div>
  )
}
