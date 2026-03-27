import { Icon } from '@iconify/react'
import { motion } from 'motion/react'

const PROVIDER_ALIASES: Record<string, string> = {
  eks: 'aws',
  aks: 'azure',
  gke: 'gcp',
}

const PROVIDER_ICONS: Record<string, { icon: string; color: string; bg: string }> = {
  minikube: {
    icon: 'simple-icons:kubernetes',
    color: '#326CE5',
    bg: 'color-mix(in srgb, #326CE5 15%, transparent)',
  },
  kubeconfig: {
    icon: 'mdi:file-cog-outline',
    color: '#9CA3AF',
    bg: 'color-mix(in srgb, #6B7280 15%, transparent)',
  },
  aws: {
    icon: 'simple-icons:amazonaws',
    color: '#FF9900',
    bg: 'color-mix(in srgb, #FF9900 15%, transparent)',
  },
  gcp: {
    icon: 'simple-icons:googlecloud',
    color: '#4285F4',
    bg: 'color-mix(in srgb, #4285F4 15%, transparent)',
  },
  azure: {
    icon: 'simple-icons:microsoftazure',
    color: '#0078D4',
    bg: 'color-mix(in srgb, #0078D4 15%, transparent)',
  },
  k3s: {
    icon: 'simple-icons:k3s',
    color: '#FFC61C',
    bg: 'color-mix(in srgb, #FFC61C 15%, transparent)',
  },
  kind: {
    icon: 'simple-icons:kubernetes',
    color: '#326CE5',
    bg: 'color-mix(in srgb, #326CE5 15%, transparent)',
  },
  docker: {
    icon: 'simple-icons:docker',
    color: '#2496ED',
    bg: 'color-mix(in srgb, #2496ED 15%, transparent)',
  },
  do: {
    icon: 'simple-icons:digitalocean',
    color: '#0080FF',
    bg: 'color-mix(in srgb, #0080FF 15%, transparent)',
  },
  rancher: {
    icon: 'simple-icons:rancher',
    color: '#0075A8',
    bg: 'color-mix(in srgb, #0075A8 15%, transparent)',
  },
  onprem: {
    icon: 'simple-icons:kubernetes',
    color: '#326CE5',
    bg: 'color-mix(in srgb, #326CE5 15%, transparent)',
  },
}

const DEFAULT_ICON = {
  icon: 'simple-icons:kubernetes',
  color: '#326CE5',
  bg: 'color-mix(in srgb, #326CE5 12%, transparent)',
}

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
