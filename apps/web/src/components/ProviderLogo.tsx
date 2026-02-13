import { Icon } from '@iconify/react'

const PROVIDER_ICONS: Record<string, { icon: string; color: string }> = {
  minikube: { icon: 'simple-icons:kubernetes', color: '#326CE5' },
  eks: { icon: 'simple-icons:amazonaws', color: '#FF9900' },
  gke: { icon: 'simple-icons:googlecloud', color: '#4285F4' },
  aks: { icon: 'simple-icons:microsoftazure', color: '#0078D4' },
  k3s: { icon: 'simple-icons:k3s', color: '#FFC61C' },
  rancher: { icon: 'simple-icons:rancher', color: '#0075A8' },
}

const DEFAULT_ICON = { icon: 'simple-icons:kubernetes', color: '#326CE5' }

export function ProviderLogo({ provider }: { provider: string }) {
  const { icon, color } = PROVIDER_ICONS[provider.toLowerCase()] ?? DEFAULT_ICON
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
