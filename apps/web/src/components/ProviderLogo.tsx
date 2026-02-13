import { Icon } from '@iconify/react'

const PROVIDER_ALIASES: Record<string, string> = {
  eks: 'aws',
  aks: 'azure',
  gke: 'gcp',
}

const PROVIDER_ICONS: Record<string, { icon: string; color: string }> = {
  minikube: { icon: 'simple-icons:kubernetes', color: '#326CE5' },
  aws: { icon: 'simple-icons:amazonaws', color: '#FF9900' },
  gcp: { icon: 'simple-icons:googlecloud', color: '#4285F4' },
  azure: { icon: 'simple-icons:microsoftazure', color: '#0078D4' },
  k3s: { icon: 'simple-icons:k3s', color: '#FFC61C' },
  kind: { icon: 'simple-icons:kubernetes', color: '#326CE5' },
  docker: { icon: 'simple-icons:docker', color: '#2496ED' },
  do: { icon: 'simple-icons:digitalocean', color: '#0080FF' },
  rancher: { icon: 'simple-icons:rancher', color: '#0075A8' },
  onprem: { icon: 'simple-icons:kubernetes', color: '#326CE5' },
}

const DEFAULT_ICON = { icon: 'simple-icons:kubernetes', color: '#326CE5' }

export function ProviderLogo({ provider }: { provider: string }) {
  const normalized = PROVIDER_ALIASES[provider.toLowerCase()] || provider.toLowerCase()
  const { icon, color } = PROVIDER_ICONS[normalized] ?? DEFAULT_ICON
  return (
    <div
      className="pointer-events-none select-none"
      style={{
        opacity: 'var(--watermark-opacity)',
        zIndex: 2,
      }}
    >
      <Icon icon={icon} width={32} height={32} color={color} />
    </div>
  )
}
