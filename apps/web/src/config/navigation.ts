import {
  Activity,
  AlertTriangle,
  Bell,
  Bot,
  Box,
  ClipboardList,
  FileText,
  Flag,
  HeartPulse,
  LayoutDashboard,
  Server,
  Settings,
  Shield,
  Users,
  UsersRound,
  Webhook,
  Wind,
} from 'lucide-react'

type NavItem = {
  id: string
  label: string
  icon: typeof LayoutDashboard
  adminOnly?: boolean
  section?: 'access-control' | 'autoscaling'
}

export const navItems: NavItem[] = [
  { id: '/', label: 'Dashboard', icon: LayoutDashboard },
  { id: '/clusters', label: 'Clusters', icon: Server },
  { id: '/system-health', label: 'Health', icon: HeartPulse },
  { id: '/deployments', label: 'Deployments', icon: Box },
  { id: '/events', label: 'Events', icon: Activity },
  { id: '/alerts', label: 'Alerts', icon: Bell },
  { id: '/anomalies', label: '⚠️ Anomalies', icon: AlertTriangle },
  { id: '/logs', label: 'Logs', icon: FileText },
  { id: '/ai', label: '🤖 AI Assistant', icon: Bot },
  { id: '/features', label: 'Feature Flags', icon: Flag, adminOnly: true },
  { id: '/webhooks', label: 'Webhooks', icon: Webhook, adminOnly: true },
  { id: '/users', label: 'Users', icon: Users, adminOnly: true },
  { id: '/audit', label: 'Audit Log', icon: ClipboardList, adminOnly: true },
  { id: '/teams', label: 'Teams', icon: UsersRound, adminOnly: true, section: 'access-control' },
  {
    id: '/permissions',
    label: 'Permissions',
    icon: Shield,
    adminOnly: true,
    section: 'access-control',
  },
  { id: '/karpenter', label: 'Karpenter', icon: Wind, section: 'autoscaling' },
  { id: '/settings', label: 'Settings', icon: Settings },
] as const
