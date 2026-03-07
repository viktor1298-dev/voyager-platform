import { Icon } from '@iconify/react'
import { motion } from 'motion/react'

const PROVIDER_ALIASES: Record<string, string> = {
  eks: 'aws',
  aks: 'azure',
  gke: 'gcp',
}

const PROVIDER_ICONS: Record<string, { icon: string; color: string; bg: string }> = {
  minikube: { icon: 'simple-icons:kubernetes', color: '#326CE5', bg: 'rgba(50, 108, 229, 0.15)' },
  kubeconfig: { icon: 'mdi:file-cog-outline', color: '#9CA3AF', bg: 'rgba(107, 114, 128, 0.15)' },
  aws: { icon: 'simple-icons:amazonaws', color: '#FF9900', bg: 'rgba(255, 153, 0, 0.15)' },
  gcp: { icon: 'simple-icons:googlecloud', color: '#4285F4', bg: 'rgba(66, 133, 244, 0.15)' },
  azure: { icon: 'simple-icons:microsoftazure', color: '#0078D4', bg: 'rgba(0, 120, 212, 0.15)' },
  k3s: { icon: 'simple-icons:k3s', color: '#FFC61C', bg: 'rgba(255, 198, 28, 0.15)' },
  kind: { icon: 'simple-icons:kubernetes', color: '#326CE5', bg: 'rgba(50, 108, 229, 0.15)' },
  docker: { icon: 'simple-icons:docker', color: '#2496ED', bg: 'rgba(36, 150, 237, 0.15)' },
  do: { icon: 'simple-icons:digitalocean', color: '#0080FF', bg: 'rgba(0, 128, 255, 0.15)' },
  rancher: { icon: 'simple-icons:rancher', color: '#0075A8', bg: 'rgba(0, 117, 168, 0.15)' },
  onprem: { icon: 'simple-icons:kubernetes', color: '#326CE5', bg: 'rgba(50, 108, 229, 0.15)' },
}

const DEFAULT_ICON = { icon: 'simple-icons:kubernetes', color: '#326CE5', bg: 'rgba(50, 108, 229, 0.12)' }

interface ProviderLogoProps {
  provider: string
  size?: number
  /** P3-010: layoutId for shared element transitions between cluster list → detail */
  layoutId?: string
}

export function ProviderLogo({ provider, size = 16, layoutId }: ProviderLogoProps) {
  const normalized = PROVIDER_ALIASES[provider.toLowerCase()] || provider.toLowerCase()
  const { icon, color, bg } = PROVIDER_ICONS[normalized] ?? DEFAULT_ICON

  if (layoutId) {
    return (
      <motion.div
        layoutId={layoutId}
        className="pointer-events-none select-none shrink-0 rounded-md flex items-center justify-center"
        style={{ width: size + 8, height: size + 8, backgroundColor: bg, zIndex: 2 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
        <Icon icon={icon} width={size} height={size} color={color} />
      </motion.div>
    )
  }

  return (
    <div
      className="pointer-events-none select-none shrink-0 rounded-md flex items-center justify-center"
      style={{ width: size + 8, height: size + 8, backgroundColor: bg, zIndex: 2 }}
    >
      <Icon icon={icon} width={size} height={size} color={color} />
    </div>
  )
}
